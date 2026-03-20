const puppeteer = require('puppeteer');
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

// ── Google Search via Puppeteer ────────────────────────────────────
async function searchGoogle(browser, query) {
  const page = await browser.newPage();
  const ua = randomUserAgent();
  await page.setUserAgent(ua);
  await page.setViewport({ width: 1366, height: 768 });

  const results = [];

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${config.maxResultsPerQuery}`;
    console.log(`  🔍 Searching: "${query}"`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait a moment for results to render
    await new Promise(r => setTimeout(r, 2000));

    // Extract organic result links
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('div#search a[href^="http"]');
      const urls = [];
      anchors.forEach(a => {
        const href = a.href;
        if (href && !href.includes('google.com') && !href.includes('webcache')) {
          urls.push(href);
        }
      });
      return urls;
    });

    for (const link of links) {
      if (!isBlockedDomain(link)) {
        results.push(cleanUrl(link));
      }
    }
  } catch (err) {
    console.log(`  ⚠️  Google search failed for "${query}": ${err.message}`);
    // Fallback to DuckDuckGo
    const ddgResults = await searchDuckDuckGo(page, query);
    results.push(...ddgResults);
  } finally {
    await page.close();
  }

  return [...new Set(results)].slice(0, config.maxResultsPerQuery);
}

// ── DuckDuckGo Fallback ────────────────────────────────────────────
async function searchDuckDuckGo(page, query) {
  const results = [];

  try {
    console.log(`  🦆 Falling back to DuckDuckGo for: "${query}"`);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a.result__a');
      return Array.from(anchors).map(a => a.href).filter(h => h.startsWith('http'));
    });

    for (const link of links) {
      if (!isBlockedDomain(link)) {
        results.push(cleanUrl(link));
      }
    }
  } catch (err) {
    console.log(`  ⚠️  DuckDuckGo search also failed: ${err.message}`);
  }

  return results;
}

// ── Main: Collect all URLs from all queries ────────────────────────
async function collectSearchResults() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📡 STEP 1: Searching for leads...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const allUrls = new Set();

  for (let i = 0; i < config.searchQueries.length; i++) {
    const query = config.searchQueries[i];
    const urls = await searchGoogle(browser, query);

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
