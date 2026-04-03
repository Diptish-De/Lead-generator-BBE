const express = require('express');
const cors = require('cors');

const { collectSearchResults } = require('./scraper/googleSearch');
const { extractFromAllWebsites } = require('./scraper/websiteExtractor');
const { analyzeAllLeads } = require('./analyzer/leadAnalyzer');
const { scoreAndFilterLeads } = require('./analyzer/leadScorer');
const { exportToCsv } = require('./output/csvExporter');
const { exportToGoogleSheet } = require('./output/sheetsExporter');
const config = require('./config');

const outreachEngine = require('./outreach/outreachEngine');
const { checkReplies } = require('./outreach/replyChecker');

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
      You are a B2B lead generation expert for 'BlueBloodExports'. We export Indian artisan handicrafts, luxury home decor, and small-batch sustainable products.
      Based on these user topics: [${topics.join(', ')}] and custom context: "${custom || ''}", suggest 10 specific, high-intent Google search queries to find potential B2B buyers like boutiques, gift shops, and interior design studios.
      
      Queries should be formatted for search engines (e.g., 'luxury home decor boutique in London').
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

// GET all leads from CSV
app.get('/api/leads', (req, res) => {
  const results = [];
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) {
    return res.json({ leads: [] });
  }

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      res.json({ leads: results });
    })
    .on('error', (error) => {
      res.status(500).json({ error: error.message });
    });
});

// UPDATE a lead by index (0-based) for Status or Emailed
app.put('/api/leads/:index', (req, res) => {
  const indexToUpdate = parseInt(req.params.index, 10);
  const updates = req.body; // e.g., { Status: 'Trashed', Emailed: 'true' }
  const results = [];
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'File not found' });

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      if (indexToUpdate >= 0 && indexToUpdate < results.length) {
        results[indexToUpdate] = { ...results[indexToUpdate], ...updates };

        if (updates.Status && ['Contacted', 'Replied', 'Negotiation'].includes(updates.Status)) {
          results[indexToUpdate]['Last Contacted'] = new Date().toISOString();
        }

        const { createObjectCsvWriter } = require('csv-writer');
        const csvWriter = createObjectCsvWriter({
          path: csvPath,
          header: config.csvHeaders.map(h => ({ id: h, title: h })),
          encoding: 'utf8'
        });

        await csvWriter.writeRecords(results);
        res.json({ success: true, leads: results });
      } else {
        res.status(400).json({ error: 'Invalid index' });
      }
    });
});

// DELETE a lead by index (0-based) - PERMANENT DELETE
app.delete('/api/leads/:index', (req, res) => {
  const indexToDelete = parseInt(req.params.index, 10);
  const results = [];
  const csvPath = path.resolve(config.outputFile);

  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'File not found' });

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      if (indexToDelete >= 0 && indexToDelete < results.length) {
        results.splice(indexToDelete, 1);

        const { createObjectCsvWriter } = require('csv-writer');
        const csvWriter = createObjectCsvWriter({
          path: csvPath,
          header: config.csvHeaders.map(h => ({ id: h, title: h })),
          encoding: 'utf8'
        });

        await csvWriter.writeRecords(results);
        res.json({ success: true, leads: results });
      } else {
        res.status(400).json({ error: 'Invalid index' });
      }
    });
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
    await exportToCsv(finalLeads);
    
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
  const { indices, updates } = req.body;
  if (!indices || !Array.isArray(indices)) return res.status(400).json({ error: 'Indices required' });

  await waitForLock();
  isWriting = true;

  try {
    const results = [];
    const csvPath = path.resolve(config.outputFile);
    
    // Read current
    const fs = require('fs');
    const stream = fs.createReadStream(csvPath).pipe(csv());
    for await (const row of stream) { results.push(row); }

    // Update multiples
    indices.forEach(idx => {
      if (idx >= 0 && idx < results.length) {
        results[idx] = { ...results[idx], ...updates };
        if (updates.Status && ['Contacted', 'Replied', 'Negotiation'].includes(updates.Status)) {
          results[idx]['Last Contacted'] = new Date().toISOString();
        }
      }
    });

    // Write back
    const { createObjectCsvWriter } = require('csv-writer');
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: config.csvHeaders.map(h => ({ id: h, title: h })),
      encoding: 'utf8'
    });
    await csvWriter.writeRecords(results);
    res.json({ success: true, leads: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isWriting = false;
  }
});

// BULK DELETE leads
app.post('/api/leads/bulk-delete', async (req, res) => {
  const { indices } = req.body;
  if (!indices || !Array.isArray(indices)) return res.status(400).json({ error: 'Indices required' });

  await waitForLock();
  isWriting = true;

  try {
    const results = [];
    const csvPath = path.resolve(config.outputFile);
    const fs = require('fs');
    const stream = fs.createReadStream(csvPath).pipe(csv());
    for await (const row of stream) { results.push(row); }

    // Sort indices descending to keep removal stable
    const sortedIndices = [...indices].sort((a, b) => b - a);
    sortedIndices.forEach(idx => {
      if (idx >= 0 && idx < results.length) results.splice(idx, 1);
    });

    const { createObjectCsvWriter } = require('csv-writer');
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: config.csvHeaders.map(h => ({ id: h, title: h })),
      encoding: 'utf8'
    });
    await csvWriter.writeRecords(results);
    res.json({ success: true, leads: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isWriting = false;
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend Scraper API running on http://localhost:${PORT}`);
});
