const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const config = require('../config');
const {
  normalizeUrl,
  getDomain,
  cleanUrl,
  isBlockedDomain,
  randomDelay,
  randomUserAgent
} = require('../utils');

// ── Bing Search via Puppeteer (Legacy removed, moved to collectSearchResults) ──

// ── Yahoo Fallback ─────────────────────────────────────────────────
async function searchYahoo(page, query) {
  const results = [];

  try {
    console.log(`  🦆 Falling back to Yahoo Search for: "${query}"`);
    const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${config.maxResultsPerQuery}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('.algo-title, .title a, a');
      return Array.from(anchors)
        .map(a => a.href)
        .filter(h => h && h.startsWith('http') && !h.includes('yahoo.com') && !h.includes('bing.com'));
    });

    for (const link of links) {
      if (!isBlockedDomain(link, config)) {
        results.push(cleanUrl(link));
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Yahoo search also failed: ${err.message}`);
  }

  return results;
}

async function collectSearchResults(options = {}) {
  const limit = options.searchLimit || config.maxResultsPerQuery || 10;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 STEP 1: Searching for leads (Max ${limit} per query)...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Search Functions (Moved inside for easy access to 'limit')
  const searchBingLocal = async (browser, query) => {
    const page = await browser.newPage();
    const ua = randomUserAgent(config);
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1366, height: 768 });
    const results = [];
    try {
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`;
      console.log(`  🔍 Searching Bing: "${query}"`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));
      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('h2 a, .b_algo h2 a');
        return Array.from(anchors).map(a => a.href).filter(h => h && h.startsWith('http') && !h.includes('bing.com') && !h.includes('microsoft.com'));
      });
      for (const link of links) { if (!isBlockedDomain(link, config)) results.push(cleanUrl(link)); }
      if (results.length === 0) throw new Error('Zero URLs');
    } catch (err) {
      results.push(...(await searchYahooLocal(page, query)));
    } finally { await page.close(); }
    return [...new Set(results)].slice(0, limit);
  };

  const searchYahooLocal = async (page, query) => {
    const results = [];
    try {
      console.log(`  🦆 Yahoo Fallback: "${query}"`);
      await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      const links = await page.evaluate(() => { return Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h && h.startsWith('http') && !h.includes('yahoo.com') && !h.includes('bing.com')); });
      for (const link of links) { if (!isBlockedDomain(link, config)) results.push(cleanUrl(link)); }
    } catch (e) {}
    return results;
  };

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1000,800'],
  });

  const allUrls = new Set();

  for (let i = 0; i < config.searchQueries.length; i++) {
    const query = config.searchQueries[i];
    const urls = await searchBingLocal(browser, query);
    urls.forEach(url => {
      const domain = getDomain(url);
      if (![...allUrls].some(u => getDomain(u) === domain)) allUrls.add(url);
    });
    console.log(`  ✅ Found ${urls.length} results (${allUrls.size} unique so far)\n`);
    if (i < config.searchQueries.length - 1) await new Promise(r => setTimeout(r, randomDelay(config.delayBetweenSearches)));
  }

  await browser.close();
  const finalUrls = [...allUrls];
  console.log(`\n📊 Total unique URLs collected: ${finalUrls.length}\n`);
  return finalUrls;
}

module.exports = { collectSearchResults };
