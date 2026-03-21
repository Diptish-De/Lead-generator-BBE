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
