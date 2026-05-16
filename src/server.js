const express = require('express');
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const uploadFields = upload.fields([
  { name: 'files', maxCount: 20 },
  { name: 'signature', maxCount: 1 }
]);

const { collectSearchResults } = require('./scraper/googleSearch');
const { extractFromAllWebsites } = require('./scraper/websiteExtractor');
const { analyzeAllLeads } = require('./analyzer/leadAnalyzer');
const { scoreAndFilterLeads } = require('./analyzer/leadScorer');
const { exportToCsv } = require('./output/csvExporter');
const { exportToGoogleSheet } = require('./output/sheetsExporter');
const config = require('./config');
const supabase = require('./utils/supabase');

const outreachEngine = require('./outreach/outreachEngine');
const { checkReplies } = require('./outreach/replyChecker');
const { sendNotification, sendApprovalMessage, startBotPolling } = require('./utils/telegram');
const mailer = require('./utils/mailer');

const fsMod = require('fs');
const pathMod = require('path');

// Global status store for background outreach
const outreachStatus = {};


// ── File-based batch store (survives server restarts & multiple processes) ──
const BATCHES_FILE = pathMod.join(__dirname, '..', 'pending_batches.json');
const BATCH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadBatches() {
  try {
    if (fsMod.existsSync(BATCHES_FILE)) {
      const raw = fsMod.readFileSync(BATCHES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) { console.warn('⚠️ Could not load batches file:', e.message); }
  return {};
}

function saveBatches(batches) {
  try {
    fsMod.writeFileSync(BATCHES_FILE, JSON.stringify(batches), 'utf8');
  } catch (e) { console.error('❌ Could not save batches file:', e.message); }
}

function getBatch(batchId) {
  const all = loadBatches();
  const entry = all[batchId];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > BATCH_TTL_MS) {
    deleteBatch(batchId);
    return null;
  }
  // Restore Buffers from base64
  if (entry.signatureBuffer) entry.signatureBuffer = Buffer.from(entry.signatureBuffer, 'base64');
  if (entry.fileBuffers) {
    entry.fileBuffers = entry.fileBuffers.map(f => ({ name: f.name, buffer: Buffer.from(f.buffer, 'base64') }));
  }
  return entry;
}

function setBatch(batchId, batch) {
  const all = loadBatches();
  // Serialize Buffers as base64 for JSON storage
  all[batchId] = {
    ...batch,
    signatureBuffer: batch.signatureBuffer ? Buffer.from(batch.signatureBuffer).toString('base64') : null,
    fileBuffers: (batch.fileBuffers || []).map(f => ({ name: f.name, buffer: Buffer.from(f.buffer).toString('base64') })),
    createdAt: Date.now()
  };
  saveBatches(all);
}

function deleteBatch(batchId) {
  const all = loadBatches();
  delete all[batchId];
  saveBatches(all);
}

/**
 * Triggered by Telegram Bot callback when user clicks "Approve"
 */
async function processBatchApproval(batchId) {
  const batch = getBatch(batchId);
  if (!batch) return { success: false, error: 'Batch not found or expired.' };

  console.log(`🚀 Starting dispatch for batch ${batchId} (${batch.drafts.length} emails)...`);
  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < batch.drafts.length; i++) {
    const draft = batch.drafts[i];
    console.log(`📨 [${i+1}/${batch.drafts.length}] Sending to ${draft.to}...`);
    try {
      await mailer.sendEmail(batch.config, {
        to: draft.to,
        subject: draft.subject,
        html: draft.body,
        attachments: (batch.fileBuffers || []).map(f => ({ filename: f.name, content: f.buffer })),
        signature: batch.signatureBuffer
      });
      console.log(`✅ [${i+1}/${batch.drafts.length}] Sent successfully.`);
      results.sent++;
    } catch (err) {
      const errMsg = err.message || String(err);
      console.error(`❌ [${i+1}/${batch.drafts.length}] Failed for ${draft.to}:`, errMsg);
      results.failed++;
      results.errors.push(`${draft.to}: ${errMsg}`);
    }
  }

  deleteBatch(batchId);
  console.log(`🏁 Batch ${batchId} complete. Sent: ${results.sent}, Failed: ${results.failed}`);
  return { success: true, ...results };
}
exports.processBatchApproval = processBatchApproval;


const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Simple Mutex for CSV writes
let isWriting = false;
const waitForLock = () => new Promise(resolve => {
  const check = () => { if (!isWriting) resolve(); else setTimeout(check, 10); };
  check();
});

// A simple in-memory log capturer
let currentLogs = [];
let abortController = null;
const originalConsoleLog = console.log;
console.log = function (...args) {
  currentLogs.push(args.join(' '));
  // Keep memory light
  if (currentLogs.length > 500) currentLogs.shift();
  originalConsoleLog.apply(console, args);
};

// Start Scrape Endpoint
app.post('/api/scrape', async (req, res) => {
  const { queries, options } = req.body;

  if (queries && Array.isArray(queries) && queries.length > 0) {
    config.searchQueries = queries;
  }

  currentLogs = []; // Reset logs
  console.log(`🚀 Starting API Scraping Job...`);

  abortController = new AbortController();
  
  runScraperJob(options, abortController.signal).catch(err => {
    if (err.name === 'AbortError') {
      console.log(`🛑 Job manually stopped by user.`);
    } else {
      console.log(`❌ API Error: ${err.message}`);
    }
    abortController = null;
  });

  res.json({ success: true, message: 'Scraping job started.' });
});

// Stop Job Endpoint
app.post('/api/stop', (req, res) => {
  if (abortController) {
    abortController.abort();
    res.json({ success: true, message: 'Stop signal sent.' });
  } else {
    res.status(400).json({ success: false, message: 'No job running.' });
  }
});

// Logs Endpoint
app.get('/api/logs', (req, res) => {
  res.json({ logs: currentLogs });
});

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Suggest Keywords Endpoint (AI-Powered)
app.post('/api/suggest-keywords', async (req, res) => {
  const { topics, custom } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(400).json({ error: 'AI Engine Offline (Gemini Key Missing)' });
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const prompt = `
      You are a B2B export lead generation expert for 'BlueBloodExports', an Indian company that EXPORTS artisan handicrafts, home decor, and handcrafted furniture.
      We need to find IMPORTERS, wholesale BUYERS, and DISTRIBUTORS who want to buy from Indian exporters.
      
      Based on these user topics: [${topics.join(', ')}] and custom context: "${custom || ''}", suggest 10 specific, high-intent Google search queries to find potential IMPORTERS and wholesale BUYERS on B2B trade platforms (TradeKey, Go4WorldBusiness, Kompass, ThomasNet, etc.) and direct buyer search queries.
      
      Focus on queries like:
      - "handicraft importers [country] wholesale buyers email"
      - "site:tradekey.com home decor importers"
      - "wholesale Indian handicraft buyers [region]"
      
      Return ONLY a JSON array of strings. No markdown.
    `;

    const result = await model.generateContent(prompt);
    let output = result.response.text().replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(output);
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all leads from Supabase
app.get('/api/leads', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    res.json({ leads: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a lead by ID
app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    
    // Fetch all leads again to keep frontend in sync (as per old behavior)
    const { data: allLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
    res.json({ success: true, leads: allLeads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a lead by ID
app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    const { data: allLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
    res.json({ success: true, leads: allLeads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Old legacy delete removed

// IMPORT leads from CSV
app.post('/api/leads/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const results = [];
  const bufferStream = require('stream').Readable.from(req.file.buffer.toString());
  
  try {
    bufferStream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        // Map common headers to our schema
        const mappedLeads = results.map(row => {
          const lead = {};
          // Normalize keys (case-insensitive and space-flexible)
          const findVal = (names) => {
            const key = Object.keys(row).find(k => 
              names.some(n => k.toLowerCase().replace(/\s/g, '').includes(n.toLowerCase().replace(/\s/g, '')))
            );
            return key ? row[key] : null;
          };

          lead['Company Name'] = findVal(['Company', 'Business', 'Name', 'Title']) || 'Unknown';
          lead['Email'] = findVal(['Email', 'Mail', 'Contact Email']);
          lead['Website'] = findVal(['Website', 'URL', 'Link', 'Site']);
          lead['Country'] = findVal(['Country', 'Location', 'Region']);
          lead['City'] = findVal(['City', 'Town']);
          lead['Phone'] = findVal(['Phone', 'Mobile', 'Tel', 'Contact']);
          lead['Status'] = 'New';
          
          return lead;
        }).filter(l => l.Email); // Only import leads with emails

        if (mappedLeads.length === 0) {
          return res.status(400).json({ error: 'No valid leads found (missing Email column?)' });
        }

        const { error } = await supabase.from('leads').insert(mappedLeads);
        if (error) throw error;

        const { data: allLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
        res.json({ success: true, count: mappedLeads.length, leads: allLeads });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EXPORT to Sheets Endpoint
app.post('/api/export-sheets', async (req, res) => {
  try {
    const leads = req.body.leads || [];
    if (leads.length === 0) return res.json({ success: false, message: 'No leads to export' });

    // Convert format slightly to match what sheetsExporter expects (chance, leadScore, dateScraped properties)
    const mappedLeads = leads.map(l => ({
      companyName: l['Company Name'],
      website: l['Website'],
      email: l['Email'],
      country: l['Country'],
      city: l['City'],
      businessType: l['Business Type'],
      productStyle: l['Product Style'],
      targetAudience: l['Target Audience'],
      instagram: l['Instagram'],
      phone: l['Phone'],
      notes: l['Notes'],
      leadScore: l['Lead Score'],
      chance: l['Chance'],
      dateScraped: l['Date Scraped'],
      status: l['Status'],
      emailed: l['Emailed'],
    }));

    const result = await exportToGoogleSheet(mappedLeads);
    res.json({ success: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CHECK for Replies Endpoint
app.get('/api/replies', async (req, res) => {
  try {
    const updatedLeads = await checkReplies();
    res.json({ success: true, updatedLeads });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// OUTREACH ENGINE API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET outreach stats
app.get('/api/outreach/stats', (req, res) => {
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) {
    return res.json({
      stats: { total: 0, byPriority: {}, byStatus: {}, actionable: 0 },
      leads: []
    });
  }

  const results = [];
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
      // Map CSV columns to outreach format
      results.push({
        companyName: data['Company Name'] || '',
        email: data['Email'] || '',
        businessType: data['Business Type'] || '',
        productStyle: data['Product Style'] || '',
        leadScore: parseInt(data['Lead Score'], 10) || 1,
        status: data['Status'] || outreachEngine.STATUS.NEW,
        assignedEmail: data['Assigned Email'] || null,
        sentAt: data['Sent At'] || null,
        lastFollowUpAt: data['Last Follow-up'] || null,
        contactName: data['Contact Name'] || null
      });
    })
    .on('end', () => {
      // Initialize outreach data
      const initializedLeads = outreachEngine.initializeOutreachData(results);
      const sortedLeads = outreachEngine.sortLeads(initializedLeads);
      const stats = outreachEngine.getOutreachStats(sortedLeads);

      res.json({
        stats,
        leads: sortedLeads
      });
    })
    .on('error', (error) => {
      res.status(500).json({ error: error.message });
    });
});

// GET actionable leads (what to do next)
app.get('/api/outreach/actionable', (req, res) => {
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) {
    return res.json({ actionable: [], drafts: [] });
  }

  const results = [];
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
      results.push({
        companyName: data['Company Name'] || '',
        email: data['Email'] || '',
        businessType: data['Business Type'] || '',
        productStyle: data['Product Style'] || '',
        leadScore: parseInt(data['Lead Score'], 10) || 1,
        status: data['Status'] || outreachEngine.STATUS.NEW,
        assignedEmail: data['Assigned Email'] || null,
        sentAt: data['Sent At'] || null,
        lastFollowUpAt: data['Last Follow-up'] || null,
        contactName: data['Contact Name'] || null
      });
    })
    .on('end', () => {
      const initializedLeads = outreachEngine.initializeOutreachData(results);
      const actionable = outreachEngine.getActionableLeads(initializedLeads);

      // Generate drafts for each actionable lead
      const drafts = [];
      const usedAccounts = [];

      actionable.forEach(lead => {
        const actions = outreachEngine.processLead(lead, usedAccounts);
        actions.forEach(action => {
          if (action.draft) {
            usedAccounts.push(action.draft.from);
            drafts.push({
              lead,
              action: action.action,
              draft: action.draft,
              updates: action.updates
            });
          }
        });
      });

      res.json({
        actionable,
        drafts,
        summary: {
          total: actionable.length,
          new: actionable.filter(l => l.status === outreachEngine.STATUS.NEW).length,
          needsFollowUp: actionable.filter(l => l.status === outreachEngine.STATUS.SENT).length,
          replied: actionable.filter(l => l.status === outreachEngine.STATUS.REPLIED).length
        }
      });
    })
    .on('error', (error) => {
      res.status(500).json({ error: error.message });
    });
});

// UPDATE lead status (mark as sent, replied, etc.)
app.put('/api/outreach/leads/:index', (req, res) => {
  const indexToUpdate = parseInt(req.params.index, 10);
  const { status, action, assignedEmail } = req.body;
  const results = [];
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'File not found' });

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      if (indexToUpdate < 0 || indexToUpdate >= results.length) {
        return res.status(400).json({ error: 'Invalid index' });
      }

      const lead = results[indexToUpdate];
      const updates = {};

      // Handle different status changes
      if (status) {
        updates['Status'] = status;

        // Set timestamps based on status
        if (status === outreachEngine.STATUS.SENT) {
          updates['Sent At'] = new Date().toISOString();
        } else if (status === outreachEngine.STATUS.REPLIED) {
          updates['Last Contacted'] = new Date().toISOString();
        } else if (status === outreachEngine.STATUS.FOLLOWUP_SENT) {
          updates['Last Follow-up'] = new Date().toISOString();
        }
      }

      if (assignedEmail) {
        updates['Assigned Email'] = assignedEmail;
      }

      // Apply updates
      results[indexToUpdate] = { ...results[indexToUpdate], ...updates };

      // Write back to CSV
      const { createObjectCsvWriter } = require('csv-writer');
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: config.csvHeaders.map(h => ({ id: h, title: h })),
        encoding: 'utf8'
      });

      await csvWriter.writeRecords(results);
      res.json({ success: true, lead: results[indexToUpdate] });
    });
});

// Batch update leads
app.post('/api/outreach/batch-update', async (req, res) => {
  const { updates } = req.body; // Array of { index, status, assignedEmail }
  const results = [];
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'File not found' });

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      let updatedCount = 0;

      for (const update of updates) {
        const { index, status, assignedEmail } = update;
        if (index >= 0 && index < results.length) {
          const lead = results[index];

          if (status) {
            lead['Status'] = status;
            if (status === outreachEngine.STATUS.SENT) {
              lead['Sent At'] = new Date().toISOString();
            } else if (status === outreachEngine.STATUS.FOLLOWUP_SENT) {
              lead['Last Follow-up'] = new Date().toISOString();
            }
          }

          if (assignedEmail) {
            lead['Assigned Email'] = assignedEmail;
          }

          updatedCount++;
        }
      }

      const { createObjectCsvWriter } = require('csv-writer');
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: config.csvHeaders.map(h => ({ id: h, title: h })),
        encoding: 'utf8'
      });

      await csvWriter.writeRecords(results);
      res.json({ success: true, updated: updatedCount });
    });
});

async function runScraperJob(options = {}, signal) {
  const checkAbort = () => {
    if (signal?.aborted) {
      const err = new Error('Job aborted');
      err.name = 'AbortError';
      throw err;
    }
  };

  const startTime = Date.now();
  console.log(`\n================================`);
  console.log(`🏪  BlueBloodExports LEAD GENERATOR API`);
  console.log(`================================`);

  try {
    checkAbort();
    const urls = await collectSearchResults(options);
    if (urls.length === 0) {
      console.log('❌ No URLs found. Google may be blocking searches.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    checkAbort();
    const extractedData = await extractFromAllWebsites(urls, options);
    if (extractedData.length === 0) {
      console.log('❌ Could not extract data from any website.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    checkAbort();
    const analyzedLeads = await analyzeAllLeads(extractedData);
    
    checkAbort();
    const finalLeads = scoreAndFilterLeads(analyzedLeads, options);

    if (finalLeads.length === 0) {
      console.log('❌ No qualified leads found after filtering.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    checkAbort();
    checkAbort();
    await exportToCsv(finalLeads);

    // Sync to Supabase
    console.log(`☁️ Syncing ${finalLeads.length} new leads to Supabase...`);
    const { error: sbError } = await supabase.from('leads').insert(finalLeads);
    if (sbError) console.error('❌ Supabase Sync Error:', sbError.message);
    
    // Auto-Export to Sheets if enabled
    if (options.autoExport) {
      checkAbort();
      console.log('📊 Auto-Syncing to Google Sheets...');
      await exportToGoogleSheet(finalLeads);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 DONE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  📊 Total leads: ${finalLeads.length}`);
    console.log(`  ⏱️  Time: ${elapsed} minutes`);
    console.log('--- JOB FINISHED SUCCESSFULLY ---');

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.log('--- JOB FINISHED WITH ERRORS ---');
  }
}

// BULK UPDATE leads
app.post('/api/leads/bulk-update', async (req, res) => {
  const { ids, indices, updates } = req.body;
  
  try {
    if (ids && Array.isArray(ids)) {
      // Modern ID-based bulk update
      const { error } = await supabase
        .from('leads')
        .update({
          ...updates,
          'Last Contacted': updates.Status && ['Contacted', 'Replied', 'Negotiation'].includes(updates.Status) 
            ? new Date().toISOString() 
            : undefined
        })
        .in('id', ids);

      if (error) throw error;
    } else if (indices && Array.isArray(indices)) {
      // Legacy index-based update (fallback)
      // Since we just migrated, we'll fetch all and update by index
      const { data: allLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
      const targetIds = indices.map(idx => allLeads[idx]?.id).filter(Boolean);
      
      const { error } = await supabase
        .from('leads')
        .update({
          ...updates,
          'Last Contacted': updates.Status && ['Contacted', 'Replied', 'Negotiation'].includes(updates.Status) 
            ? new Date().toISOString() 
            : undefined
        })
        .in('id', targetIds);

      if (error) throw error;
    }

    const { data: updatedLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
    res.json({ success: true, leads: updatedLeads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK DELETE leads
app.post('/api/leads/bulk-delete', async (req, res) => {
  const { ids, indices } = req.body;

  try {
    if (ids && Array.isArray(ids)) {
      const { error } = await supabase.from('leads').delete().in('id', ids);
      if (error) throw error;
    } else if (indices && Array.isArray(indices)) {
      const { data: allLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
      const targetIds = indices.map(idx => allLeads[idx]?.id).filter(Boolean);
      const { error } = await supabase.from('leads').delete().in('id', targetIds);
      if (error) throw error;
    }

    const { data: updatedLeads } = await supabase.from('leads').select('*').order('id', { ascending: true });
    res.json({ success: true, leads: updatedLeads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MANUALLY ADD single lead
app.post('/api/leads/add', async (req, res) => {
  const newLead = req.body.lead;
  if (!newLead) return res.status(400).json({ error: 'Lead data required' });

  await waitForLock();
  isWriting = true;

  try {
    const results = [];
    const csvPath = path.resolve(config.outputFile);
    const fs = require('fs');
    if (fs.existsSync(csvPath)) {
      const stream = fs.createReadStream(csvPath).pipe(csv());
      for await (const row of stream) { results.push(row); }
    }

    newLead['Date Scraped'] = new Date().toISOString();
    newLead['Status'] = 'New';
    newLead['Lead Score'] = 'Medium';
    newLead['Chance'] = '50%';
    
    const fullLead = {};
    config.csvHeaders.forEach(h => fullLead[h] = newLead[h] || '');
    results.push(fullLead);

    const { createObjectCsvWriter } = require('csv-writer');
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: config.csvHeaders.map(h => ({ id: h, title: h })),
      encoding: 'utf8'
    });
    await csvWriter.writeRecords(results);
    res.json({ success: true, lead: fullLead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isWriting = false;
  }
});

// IMPORT LEADS (CSV, Excel, PDF)
app.post('/api/leads/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let importedLeads = [];

    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      const xlsx = require('xlsx');
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      
      importedLeads = data.map(row => {
        return {
          'Company Name': row['Company'] || row['Company Name'] || row['Name'] || '',
          'Email': row['Email'] || row['Email Address'] || '',
          'Website': row['Website'] || row['URL'] || '',
          'Phone': row['Phone'] || row['Contact'] || '',
          'Country': row['Country'] || '',
          'City': row['City'] || '',
          'Notes': 'Imported from ' + req.file.originalname
        };
      }).filter(l => l['Company Name'] || l['Email']); 

    } else if (ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      const text = data.text.substring(0, 15000); 

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: 'Cannot parse PDF without Gemini API Key in .env' });
      }

      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: "application/json" } });

      const prompt = `Extract a list of businesses/leads from the following PDF text.
Return a JSON array of objects with keys: "Company Name", "Email", "Website", "Phone", "Country", "City".
If a field is missing, leave it as an empty string. Only return valid JSON.

Text:
${text}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      try {
        importedLeads = JSON.parse(responseText);
        importedLeads.forEach(l => l['Notes'] = 'Imported from PDF via AI');
      } catch (e) {
        console.error("AI JSON Parse Error:", e);
        return res.status(500).json({ error: 'AI failed to parse PDF into structured leads.' });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload CSV, XLSX, or PDF.' });
    }

    if (importedLeads.length === 0) {
      return res.json({ success: false, message: 'No leads found in file' });
    }

    await waitForLock();
    isWriting = true;
    const results = [];
    const csvPath = path.resolve(config.outputFile);
    const fs = require('fs');
    if (fs.existsSync(csvPath)) {
      const stream = fs.createReadStream(csvPath).pipe(csv());
      for await (const row of stream) { results.push(row); }
    }

    const newRecords = importedLeads.map(l => {
      const fullLead = {};
      config.csvHeaders.forEach(h => fullLead[h] = l[h] || '');
      fullLead['Date Scraped'] = new Date().toISOString();
      fullLead['Status'] = 'New';
      fullLead['Lead Score'] = 'Medium';
      fullLead['Chance'] = '50%';
      return fullLead;
    });

    results.push(...newRecords);

    const { createObjectCsvWriter } = require('csv-writer');
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: config.csvHeaders.map(h => ({ id: h, title: h })),
      encoding: 'utf8'
    });
    await csvWriter.writeRecords(results);
    isWriting = false;

    res.json({ success: true, count: newRecords.length });

  } catch (err) {
    isWriting = false;
    res.status(500).json({ error: err.message });
  }
});

const PORT = 4000;

// NOTIFY DRAFTS — sends Telegram notification when user creates Gmail drafts
app.post('/api/notify-drafts', async (req, res) => {
  const { drafts } = req.body;
  if (!drafts || !Array.isArray(drafts) || drafts.length === 0) {
    return res.json({ success: false, message: 'No drafts provided' });
  }

  const lines = drafts.map((d, i) => `${i + 1}. *${d.company}* — ${d.email}`).join('\n');
  const message = `✉️ *BBE Outreach — ${drafts.length} Drafts Created*\n\n${lines}\n\n📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  try {
    await sendNotification(message);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// CREATE DRAFTS VIA IMAP (multipart — no base64 in browser)
app.post('/api/drafts/create', uploadFields, async (req, res) => {
  let drafts, emailConfig;
  try {
    drafts = JSON.parse(req.body.drafts);
    emailConfig = JSON.parse(req.body.config);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  if (!drafts || !emailConfig || !emailConfig.email || !emailConfig.password) {
    return res.status(400).json({ error: 'Missing email configuration or drafts.' });
  }

  const imap = require('imap-simple');
  const MailComposer = require('nodemailer/lib/mail-composer');

  const SIGNATURE_IMG_PATH = 'D:\\export_import_blueblood\\STAM E MAIL.png';
  const uploadedSig = req.files?.signature?.[0];
  const signatureBuffer = uploadedSig
    ? uploadedSig.buffer
    : (fs.existsSync(SIGNATURE_IMG_PATH) ? fs.readFileSync(SIGNATURE_IMG_PATH) : null);

  const signatureSource = uploadedSig ? 'uploaded' : (signatureBuffer ? 'disk' : 'none');
  console.log(`✅ Signature source: ${signatureSource}`);

  const mailer = require('./utils/mailer');
  const fileBuffers = (req.files?.files || []).map(f => ({ name: f.originalname, buffer: f.buffer }));
  
  const batchId = Date.now().toString(36);
  outreachStatus[batchId] = {
    current: 0,
    total: drafts.length,
    sent: 0,
    failed: 0,
    errors: [],
    isComplete: false,
    startTime: Date.now()
  };

  console.log(`🚀 Starting BACKGROUND dispatch for ${drafts.length} emails (Batch: ${batchId})...`);

  // Background sending loop
  setImmediate(async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      outreachStatus[batchId].current = i + 1;
      
      // Anti-blocking: Stagger sends if more than 1 email
      if (i > 0) {
        let waitTime = Math.floor(Math.random() * (90000 - 30000 + 1) + 30000); // 30-90 seconds
        console.log(`⏳ [Batch ${batchId}] Staggering: Next email in ${waitTime/1000}s...`);
        
        // Countdown for UI
        const startTime = Date.now();
        const interval = setInterval(() => {
          const remaining = Math.max(0, Math.round((waitTime - (Date.now() - startTime)) / 1000));
          outreachStatus[batchId].nextSendIn = remaining;
        }, 1000);

        await sleep(waitTime);
        clearInterval(interval);
        outreachStatus[batchId].nextSendIn = 0;
      }

      console.log(`📨 [Batch ${batchId}] [${i+1}/${drafts.length}] Sending to ${draft.to}...`);
      try {
        const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const uniqueHtml = `${draft.body}<div style="display:none; color:transparent; font-size:1px;">ref:${uniqueId}</div>`;

        await mailer.sendEmail(emailConfig, {
          to: draft.to,
          subject: draft.subject,
          html: uniqueHtml,
          attachments: fileBuffers.map(f => ({ filename: f.name, content: f.buffer })),
          signature: signatureBuffer
        });
        console.log(`✅ [Batch ${batchId}] Sent to ${draft.to}`);
        outreachStatus[batchId].sent++;
      } catch (err) {
        const errMsg = err.message || String(err);
        console.error(`❌ [Batch ${batchId}] Failed for ${draft.to}:`, errMsg);
        outreachStatus[batchId].failed++;
        outreachStatus[batchId].errors.push(`${draft.to}: ${errMsg}`);
      }
    }
    
    outreachStatus[batchId].isComplete = true;
    console.log(`🏁 Batch ${batchId} complete. Sent: ${outreachStatus[batchId].sent}, Failed: ${outreachStatus[batchId].failed}`);
  });

  res.json({ 
    success: true, 
    batchId,
    message: `Outreach started in background. Sending ${drafts.length} emails.`
  });
});

// GET Outreach Status for polling
app.get('/api/outreach/status/:batchId', (req, res) => {
  const { batchId } = req.params;
  const status = outreachStatus[batchId];
  if (!status) return res.status(404).json({ error: 'Batch status not found' });
  res.json(status);
});


// TEST SMTP Configuration
app.post('/api/test-email', async (req, res) => {
  const { config, to } = req.body;
  if (!config || !to) return res.status(400).json({ error: 'Missing config or recipient' });

  try {
    const mailer = require('./utils/mailer');
    await mailer.sendEmail(config, {
      to,
      subject: '🚀 BBE Outreach — SMTP Test Success',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #6366f1;">Connection Verified!</h2>
          <p>Your SMTP configuration and Google App Password are working perfectly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">This is a system-generated test email from your BlueBloodExports Dashboard.</p>
        </div>
      `
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend Scraper API running on http://localhost:${PORT}`);


  // Start Telegram bot polling for approval buttons
  const nodemailer = require('nodemailer');
  const MailComposer = require('nodemailer/lib/mail-composer');

  /* 
  const onApprove = async (batchId) => {
    console.log(`🔘 Telegram Approval received for batch: ${batchId}`);
    const result = await processBatchApproval(batchId);
    if (!result.success) {
      console.error(`❌ Approval failed for ${batchId}: ${result.error}`);
      return { message: `❌ Error: ${result.error}` };
    }
    return {
      message: `✅ *Outreach Complete!*\n\n📨 Sent: ${result.sent}\n❌ Failed: ${result.failed}\n\n📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    };
  };

  const onCancel = (batchId) => {
    pendingBatches.delete(batchId);
    console.log(`🗑️ Batch ${batchId} cancelled via Telegram.`);
  };

  startBotPolling(onApprove, onCancel);
  */
});
