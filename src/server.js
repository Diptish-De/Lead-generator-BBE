const express = require('express');
const cors = require('cors');

const { collectSearchResults } = require('./scraper/googleSearch');
const { extractFromAllWebsites } = require('./scraper/websiteExtractor');
const { analyzeAllLeads } = require('./analyzer/leadAnalyzer');
const { scoreAndFilterLeads } = require('./analyzer/leadScorer');
const { exportToCsv } = require('./output/csvExporter');
const { exportToGoogleSheet } = require('./output/sheetsExporter');
const config = require('./config');

const app = express();
app.use(cors());
app.use(express.json());

// A simple in-memory log capturer to send live logs to the frontend
let currentLogs = [];
const originalConsoleLog = console.log;
console.log = function (...args) {
  currentLogs.push(args.join(' '));
  // Keep memory light
  if (currentLogs.length > 500) currentLogs.shift();
  originalConsoleLog.apply(console, args);
};

// Start Scrape Endpoint
app.post('/api/scrape', async (req, res) => {
  const { queries } = req.body;
  
  if (queries && Array.isArray(queries) && queries.length > 0) {
    config.searchQueries = queries;
  }

  currentLogs = []; // Reset logs
  console.log(`🚀 Starting API Scraping Job...`);
  
  // We don't await here because it takes 10+ minutes.
  // We return a 200 OK immediately and let the client poll for logs/status.
  runScraperJob().catch(err => {
    console.log(`❌ API Error: ${err.message}`);
  });

  res.json({ success: true, message: 'Scraping job started.' });
});

// Logs Endpoint
app.get('/api/logs', (req, res) => {
  res.json({ logs: currentLogs });
});

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

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

async function runScraperJob() {
  const startTime = Date.now();
  console.log(`\n================================`);
  console.log(`🏪  LEAD GENERATOR API STARTED`);
  console.log(`================================`);

  try {
    const urls = await collectSearchResults();
    if (urls.length === 0) {
      console.log('❌ No URLs found. Google may be blocking searches.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    const extractedData = await extractFromAllWebsites(urls);
    if (extractedData.length === 0) {
      console.log('❌ Could not extract data from any website.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    const analyzedLeads = analyzeAllLeads(extractedData);
    const finalLeads = scoreAndFilterLeads(analyzedLeads);

    if (finalLeads.length === 0) {
      console.log('❌ No qualified leads found after filtering.');
      console.log('--- JOB FINISHED WITH ERRORS ---');
      return;
    }

    await exportToCsv(finalLeads);
    await exportToGoogleSheet(finalLeads);

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

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend Scraper API running on http://localhost:${PORT}`);
});
