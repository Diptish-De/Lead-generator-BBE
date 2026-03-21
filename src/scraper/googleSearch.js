const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const config = require('../config');

// ── Helpers ────────────────────────────────────────────────────────
function randomDelay([min, max]) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUserAgent() {
  return config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
}

function isBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return config.blockedDomains.some(blocked => hostname.includes(blocked));
  } catch {
    return true;
  }
}

function cleanUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── Bing Search via Puppeteer ──────────────────────────────────────
async function searchBing(browser, query) {
  const page = await browser.newPage();
  const ua = randomUserAgent();
  await page.setUserAgent(ua);
  await page.setViewport({ width: 1366, height: 768 });

  const results = [];

  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${config.maxResultsPerQuery}`;
    console.log(`  🔍 Searching Bing: "${query}"`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait a moment for results to render
    await new Promise(r => setTimeout(r, 2000));

    // Extract organic result links
    const links = await page.evaluate(() => {
      // Bing results are heavily contained within h2 a
      const anchors = document.querySelectorAll('h2 a, .b_algo h2 a');
      const urls = [];
      anchors.forEach(a => {
        const href = a.href;
        if (href && href.startsWith('http')) {
          const isBing = href.includes('bing.com') || href.includes('microsoft.com');
          if (!isBing) urls.push(href);
        }
      });
      return urls;
    });

    for (const link of links) {
      if (!isBlockedDomain(link)) {
        results.push(cleanUrl(link));
      }
    }

    if (results.length === 0) {
      throw new Error('Bing returned 0 organic URLs. Try Yahoo.');
    }
  } catch (err) {
    console.log(`  ⚠️  Bing search failed for "${query}": ${err.message}`);
    // Fallback to Yahoo
    const yahooResults = await searchYahoo(page, query);
    results.push(...yahooResults);
  } finally {
    await page.close();
  }

  return [...new Set(results)].slice(0, config.maxResultsPerQuery);
}

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
      if (!isBlockedDomain(link)) {
        results.push(cleanUrl(link));
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Yahoo search also failed: ${err.message}`);
  }

  return results;
}

// ── Main: Collect all URLs from all queries ────────────────────────
async function collectSearchResults() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📡 STEP 1: Searching for leads...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await puppeteer.launch({
    headless: false, // 🔴 Changed to FALSE: Visible window completely bypasses Google's headless flags!
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-blink-features=AutomationControlled',
      '--window-size=1000,800'
    ],
  });

  const allUrls = new Set();

  for (let i = 0; i < config.searchQueries.length; i++) {
    const query = config.searchQueries[i];
    const urls = await searchBing(browser, query);

    urls.forEach(url => {
      const domain = getDomain(url);
      // Deduplicate by domain (not exact URL)
      const alreadyHasDomain = [...allUrls].some(u => getDomain(u) === domain);
      if (!alreadyHasDomain) {
        allUrls.add(url);
      }
    });

    console.log(`  ✅ Found ${urls.length} results (${allUrls.size} unique so far)\n`);

    // Delay between queries
    if (i < config.searchQueries.length - 1) {
      const delay = randomDelay(config.delayBetweenSearches);
      console.log(`  ⏳ Waiting ${(delay / 1000).toFixed(1)}s before next search...\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await browser.close();

  const finalUrls = [...allUrls];
  console.log(`\n📊 Total unique URLs collected: ${finalUrls.length}\n`);
  return finalUrls;
}

module.exports = { collectSearchResults };
