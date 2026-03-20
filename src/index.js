const { collectSearchResults } = require('./scraper/googleSearch');
const { extractFromAllWebsites } = require('./scraper/websiteExtractor');
const { analyzeAllLeads } = require('./analyzer/leadAnalyzer');
const { scoreAndFilterLeads } = require('./analyzer/leadScorer');
const { exportToCsv } = require('./output/csvExporter');
const { exportToGoogleSheet } = require('./output/sheetsExporter');

// ── Banner ─────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🏪  LEAD GENERATOR — Blueblood Exports (BBE)      ║
║   Handicrafts & Home Decor Lead Scraper              ║
║                                                      ║
║   Searches → Extracts → Analyzes → Scores → Exports  ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
}

// ── Main Pipeline ──────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  printBanner();

  try {
    // ── STEP 1: Search Google ────────────────────────────────────
    const urls = await collectSearchResults();

    if (urls.length === 0) {
      console.log('❌ No URLs found. Google may be blocking searches.');
      console.log('💡 Try again later or reduce the number of queries in config.js');
      process.exit(1);
    }

    // ── STEP 2: Visit websites & extract data ────────────────────
    const extractedData = await extractFromAllWebsites(urls);

    if (extractedData.length === 0) {
      console.log('❌ Could not extract data from any website.');
      process.exit(1);
    }

    // ── STEP 3: Analyze leads ────────────────────────────────────
    const analyzedLeads = analyzeAllLeads(extractedData);

    // ── STEP 4: Score & filter ───────────────────────────────────
    const finalLeads = scoreAndFilterLeads(analyzedLeads);

    if (finalLeads.length === 0) {
      console.log('❌ No qualified leads found after filtering.');
      console.log('💡 Try broadening the search queries in config.js');
      process.exit(1);
    }

    // ── STEP 5a: Save to CSV (always, as backup) ─────────────────
    await exportToCsv(finalLeads);

    // ── STEP 5b: Send to Google Sheet ────────────────────────────
    await exportToGoogleSheet(finalLeads);

    // ── Summary ──────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 DONE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  📊 Total leads: ${finalLeads.length}`);
    console.log(`  ⭐ High chance: ${finalLeads.filter(l => l.chance === 'High').length}`);
    console.log(`  🔵 Medium chance: ${finalLeads.filter(l => l.chance === 'Medium').length}`);
    console.log(`  ⚪ Low chance: ${finalLeads.filter(l => l.chance === 'Low').length}`);
    console.log(`  ⏱️  Time: ${elapsed} minutes`);
    console.log(`  📂 CSV: output/leads.csv`);
    console.log(`  🔗 Sheet: https://docs.google.com/spreadsheets/d/1kYExdz-8bJR2c4fT--f564PXZQh2RwcU5eg51fmded4`);
    console.log('');

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run
main();
