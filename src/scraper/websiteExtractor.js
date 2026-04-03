const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const cheerio = require('cheerio');
const config = require('../config');
const {
  retryWithBackoff,
  CircuitBreaker,
  DomainCache,
  processWithConcurrency,
  normalizeUrl,
  getDomain,
  randomDelay,
  randomUserAgent
} = require('../utils');

// Initialize circuit breaker and domain cache
const circuitBreaker = new CircuitBreaker({
  failureThreshold: config.circuitBreakerThreshold,
  resetTimeout: config.circuitBreakerReset,
  maxCircuits: config.maxCircuits,
});

const domainCache = config.enableDomainCache ? new DomainCache(config.domainCacheFile, {
  maxSize: config.maxCacheSize,
  maxAge: config.maxCacheAge,
}) : null;

// ── Email Extraction ───────────────────────────────────────────────
function extractEmails(text) {
  // Standard email regex
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex) || [];

  // Decode obfuscated patterns: "name [at] domain [dot] com"
  const obfuscated = text.replace(/\s*\[\s*at\s*\]\s*/gi, '@').replace(/\s*\[\s*dot\s*\]\s*/gi, '.');
  const moreEmails = obfuscated.match(emailRegex) || [];

  // Also check for "name (at) domain (dot) com"
  const obfuscated2 = text.replace(/\s*\(\s*at\s*\)\s*/gi, '@').replace(/\s*\(\s*dot\s*\)\s*/gi, '.');
  const moreEmails2 = obfuscated2.match(emailRegex) || [];

  const all = [...new Set([...emails, ...moreEmails, ...moreEmails2])];

  // Filter out junk emails
  return all.filter(email => {
    const prefix = email.split('@')[0].toLowerCase();
    const domain = email.split('@')[1].toLowerCase();

    // Skip junk prefixes
    if (config.junkEmailPrefixes.some(junk => prefix === junk || prefix.startsWith(junk))) {
      return false;
    }

    // Skip image/file extensions falsely matched
    if (domain.match(/\.(png|jpg|jpeg|gif|svg|css|js|webp)$/i)) {
      return false;
    }

    // Skip example/test emails
    if (domain.includes('example.com') || domain.includes('test.com') || domain.includes('sentry.io')) {
      return false;
    }

    return true;
  });
}

// ── Phone Extraction ───────────────────────────────────────────────
function extractPhones(text) {
  const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
  const matches = text.match(phoneRegex) || [];

  return [...new Set(
    matches
      .map(p => p.trim())
      .filter(p => {
        const digits = p.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      })
  )].slice(0, 3); // Max 3 phone numbers
}

// ── Instagram Extraction ───────────────────────────────────────────
function extractInstagram(text, html) {
  // From href links
  const hrefRegex = /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_\.]+)\/?/g;
  const matches = [];
  let match;

  const combined = (html || '') + ' ' + (text || '');

  while ((match = hrefRegex.exec(combined)) !== null) {
    const username = match[1].toLowerCase();
    if (!['p', 'explore', 'accounts', 'about', 'legal', 'developer', 'reel', 'stories'].includes(username)) {
      matches.push(`https://instagram.com/${username}`);
    }
  }

  return [...new Set(matches)][0] || '';
}

// ── Pinterest Extraction ───────────────────────────────────────────
function extractPinterest(text, html) {
  const hrefRegex = /https?:\/\/(?:www\.)?pinterest\.com\/([a-zA-Z0-9_\.]+)\/?/g;
  const matches = [];
  let match;
  const combined = (html || '') + ' ' + (text || '');
  while ((match = hrefRegex.exec(combined)) !== null) {
    const user = match[1].toLowerCase();
    if (!['pin', 'categories', 'explore'].includes(user)) {
      matches.push(`https://pinterest.com/${user}`);
    }
  }
  return [...new Set(matches)][0] || '';
}

// ── Meta Tags Extraction ───────────────────────────────────────────
function extractMetaTags($) {
  return {
    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
    keywords: $('meta[name="keywords"]').attr('content') || '',
    title: $('title').text() || ''
  };
}

// ── Company Name Extraction ────────────────────────────────────────
function extractCompanyName($, url) {
  // Priority 1: og:site_name
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName && ogSiteName.trim().length > 1 && ogSiteName.trim().length < 80) {
    return cleanCompanyName(ogSiteName.trim());
  }

  // Priority 2: Schema.org name
  const schemaScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < schemaScripts.length; i++) {
    try {
      const data = JSON.parse($(schemaScripts[i]).html());
      if (data.name && typeof data.name === 'string' && data.name.length < 80) return cleanCompanyName(data.name);
      if (data.organization?.name && typeof data.organization.name === 'string') return cleanCompanyName(data.organization.name);
    } catch { }
  }

  // Priority 3: <title> tag
  const title = $('title').text();
  if (title && title.trim().length > 1 && title.trim().length < 100) {
    return cleanCompanyName(title.trim());
  }

  // Priority 4: First <h1>
  const h1 = $('h1').first().text();
  if (h1 && h1.trim().length > 1 && h1.trim().length < 80) {
    return cleanCompanyName(h1.trim());
  }

  // Fallback: domain name
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown';
  }
}

function cleanCompanyName(name) {
  // Strip common suffixes
  return name
    .replace(/\s*[\|–\-—]\s*(Home|Official|Website|Online|Shop|Store|Page).*$/i, '')
    .replace(/\s*-\s*Home$/i, '')
    .replace(/^\s*Home\s*[\|–\-—]\s*/i, '')
    .trim()
    .slice(0, 80);
}

// ── Decision Maker Extraction ────────────────────────────────────────
function extractDecisionMaker(text) {
  const patterns = [
    /(?:founded by|founder is|founder:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /(?:CEO|Chief Executive Officer)\s*(?:is|-|:|: )\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /(?:owner|owned by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?),\s*(?:Founder|CEO|Owner)/
  ];
  for (const pattern of patterns) {
    const match = (text || '').match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 30 && !name.toLowerCase().includes('the ')) return name;
    }
  }
  return '';
}

// ── Location Extraction ────────────────────────────────────────────
function extractLocation($, url, text) {
  let country = '';
  let city = '';

  // Check Schema.org address
  const schemaScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < schemaScripts.length; i++) {
    try {
      const data = JSON.parse($(schemaScripts[i]).html());
      const addr = data.address || data.location?.address;
      if (addr) {
        city = addr.addressLocality || '';
        country = addr.addressCountry || '';
        if (city || country) return { city, country };
      }
    } catch { }
  }

  // TLD-based country detection
  try {
    const tldMap = {
      '.co.uk': 'UK', '.uk': 'UK', '.de': 'Germany', '.fr': 'France',
      '.it': 'Italy', '.es': 'Spain', '.nl': 'Netherlands', '.se': 'Sweden',
      '.dk': 'Denmark', '.no': 'Norway', '.fi': 'Finland', '.pt': 'Portugal',
      '.at': 'Austria', '.ch': 'Switzerland', '.be': 'Belgium',
      '.com.au': 'Australia', '.au': 'Australia', '.nz': 'New Zealand',
      '.ca': 'Canada', '.in': 'India', '.jp': 'Japan',
      '.ie': 'Ireland', '.pl': 'Poland', '.cz': 'Czech Republic',
    };

    const hostname = new URL(url).hostname || '';
    for (const [tld, c] of Object.entries(tldMap)) {
      if (hostname.endsWith(tld)) {
        country = c;
        break;
      }
    }
  } catch { }

  // Regex patterns for common location strings
  const locationPatterns = [
    /(?:based\s+in|located\s+in|headquarters?\s+in|office\s+in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(USA|UK|United States|United Kingdom|Canada|Australia|Germany|France|Italy|Spain|Netherlands|India)/i,
  ];

  const pageText = text || '';
  for (const pattern of locationPatterns) {
    const locMatch = pageText.match(pattern);
    if (locMatch) {
      if (!city && locMatch[1]) city = locMatch[1].trim();
      if (!country && locMatch[2]) country = locMatch[2].trim();
      break;
    }
  }

  // Common US states → USA
  const usStates = /\b(New York|Los Angeles|Chicago|Houston|San Francisco|Miami|Seattle|Portland|Denver|Austin|Boston|Dallas|Atlanta|Nashville|San Diego|Philadelphia)\b/i;
  const stateMatch = pageText.match(usStates);
  if (stateMatch && !city) {
    city = stateMatch[1];
    if (!country) country = 'USA';
  }

  return { city, country };
}

// ── Find Contact/About Pages ───────────────────────────────────────
function findSubPages($, baseUrl) {
  const pages = [];
  const contactPatterns = /\b(contact|about|support|team|reach|story|who-we-are|faq|find-us)\b/i;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const fullUrl = new URL(href, baseUrl).href;
      const parsed = new URL(fullUrl);
      const path = parsed.pathname.toLowerCase();

      // Only same-domain links
      if (parsed.hostname === new URL(baseUrl).hostname && contactPatterns.test(path)) {
        pages.push(fullUrl);
      }
    } catch { }
  });

  return [...new Set(pages)].slice(0, config.maxPagesToCheck || 3);
}

// ── Extract All Data from a Single Website ─────────────────────────
async function extractFromWebsite(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent(config));
  await page.setViewport({ width: 1366, height: 768 });

  // Block images, fonts, media for speed
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      req.abort().catch(() => { });
    } else {
      req.continue().catch(() => { });
    }
  });

  const data = {
    companyName: '',
    website: url,
    emails: [],
    phones: [],
    instagram: '',
    city: '',
    country: '',
    decisionMaker: '',
    pageText: '',
    html: '',
  };

  try {
    // Visit main page with retry logic
    await retryWithBackoff(
      async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.siteTimeout });
      },
      {
        maxRetries: config.maxRetries,
        baseDelay: config.retryBaseDelay,
        maxDelay: config.retryMaxDelay,
      }
    );
    await new Promise(r => setTimeout(r, 1500));

    let html = await page.content();
    let $ = cheerio.load(html);
    let text = $('body').text().replace(/\s+/g, ' ');

    data.companyName = extractCompanyName($, url);
    data.emails.push(...extractEmails(text));
    data.emails.push(...extractEmails(html));
    data.phones.push(...extractPhones(text));
    data.instagram = extractInstagram(text, html);
    data.pinterest = extractPinterest(text, html);
    const meta = extractMetaTags($);
    data.metaDescription = meta.description;
    
    const loc = extractLocation($, url, text);
    data.city = loc.city;
    data.country = loc.country;
    data.decisionMaker = extractDecisionMaker(text);
    data.pageText = `${meta.title} ${meta.description} ${text.slice(0, 5000)}`;
    data.html = html;

    // Find and visit contact/about pages
    const subPages = findSubPages($, url);
    if (subPages.length > 0) {
      console.log(`    🔍 Found ${subPages.length} relevant sub-pages, checking...`);
    }

    for (const subUrl of subPages) {
      try {
        const subPath = new URL(subUrl).pathname;
        console.log(`    🚶 Visiting ${subPath}...`);
        // Retry sub-page navigation with fewer retries
        await retryWithBackoff(
          async () => {
            await page.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: config.siteTimeout });
          },
          {
            maxRetries: Math.min(2, config.maxRetries),
            baseDelay: config.retryBaseDelay,
            maxDelay: config.retryMaxDelay,
          }
        );
        await new Promise(r => setTimeout(r, 1000));

        html = await page.content();
        $ = cheerio.load(html);
        text = $('body').text().replace(/\s+/g, ' ');

        // Merge new findings
        data.emails.push(...extractEmails(text));
        data.emails.push(...extractEmails(html));
        data.phones.push(...extractPhones(text));
        if (!data.instagram) data.instagram = extractInstagram(text, html);

        const subLoc = extractLocation($, subUrl, text);
        if (!data.city && subLoc.city) data.city = subLoc.city;
        if (!data.country && subLoc.country) data.country = subLoc.country;
        if (!data.decisionMaker) data.decisionMaker = extractDecisionMaker(text);

        data.pageText += ' ' + text.slice(0, 3000);
      } catch {
        // Skip failed sub-pages silently
      }
    }

    // Deduplicate
    data.emails = [...new Set(data.emails.map(e => e.toLowerCase()))];
    data.phones = [...new Set(data.phones)];

  } catch (err) {
    console.log(`    ⚠️  Failed to extract from ${url}: ${err.message}`);
    throw err; // Re-throw for circuit breaker
  } finally {
    await page.close();
  }

  return data;
}

// ── Main: Visit all URLs and extract data ──────────────────────────
async function extractFromAllWebsites(urls, options = {}) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 STEP 2: Visiting websites & extracting data...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const concurrency = options.concurrency || config.scrapingConcurrency || 3;
  console.log(`  ⚡ Parallel processing enabled: ${concurrency} concurrent browsers\n`);

  // Show cache stats if enabled
  if (domainCache) {
    const stats = domainCache.stats();
    console.log(`  📦 Domain cache: ${stats.fresh} fresh, ${stats.stale} stale, ${stats.total} total (max: ${stats.maxSize})\n`);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
  } catch (err) {
    console.log(`  ❌ Failed to launch browser: ${err.message}`);
    return [];
  }

  const results = [];
  const skipped = [];
  const failed = [];
  let completed = 0;
  let browserCrashed = false;

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('\n  ⚠️  Received shutdown signal, closing browser...');
    try {
      if (browser && !browserCrashed) {
        await browser.close();
      }
    } catch (e) {
      console.log('  ⚠️  Error closing browser:', e.message);
    }
    console.log('  💾 Cache saved. Exiting gracefully.\n');
  };

  // Handle interrupt signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Create a processor function for each URL
  const processUrl = async (url) => {
    if (browserCrashed) return null; // Stop processing if browser crashed

    const domain = getDomain(url);
    const normalizedDomain = normalizeUrl(domain);

    // Check domain cache
    if (domainCache && domainCache.has(normalizedDomain)) {
      const cachedData = domainCache.get(normalizedDomain);
      if (cachedData) {
        return { ...cachedData, website: url, fromCache: true };
      }
    }

    // Check circuit breaker
    const circuitStatus = circuitBreaker.getStatus(domain);
    if (circuitStatus.status === 'open') {
      skipped.push({ url, reason: 'circuit_open' });
      return null;
    }

    try {
      // Execute with circuit breaker protection
      const data = await circuitBreaker.execute(domain, async () => {
        return await extractFromWebsite(browser, url);
      });

      // Cache successful results (only if has emails)
      if (domainCache && data && data.emails && data.emails.length > 0) {
        domainCache.set(normalizedDomain, data);
      }

      return data;
    } catch (err) {
      if (err.message.includes('Circuit breaker open')) {
        skipped.push({ url, reason: 'circuit_open' });
      } else {
        failed.push({ url, error: err.message });
      }
      return null;
    }
  };

  try {
    // Process URLs in batches with concurrency control
    for (let i = 0; i < urls.length; i += concurrency) {
      if (browserCrashed) break; // Stop if browser crashed

      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processUrl));

      completed += batch.length;

      // Filter out nulls and add to results
      const validResults = batchResults.filter(r => r !== null && r !== undefined);
      results.push(...validResults);

      // Log progress with results
      const successCount = validResults.length;
      const cacheCount = validResults.filter(r => r.fromCache).length;
      console.log(`  📊 [${completed}/${urls.length}] ✅${successCount} (📦${cacheCount}) ❌${failed.length} ⏭️${skipped.length}`);

      // Delay between batches to be polite
      if (i + concurrency < urls.length && !browserCrashed) {
        const delay = randomDelay(config.delayBetweenSites);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (err) {
    console.log(`\n  ❌ Batch processing error: ${err.message}`);
  }

  // Close browser gracefully
  try {
    if (browser && !browser.isClosed()) {
      await browser.close();
    }
  } catch (err) {
    console.log(`  ⚠️  Browser close error: ${err.message}`);
  }

  // Show circuit breaker stats
  const cbStats = circuitBreaker.getStats();
  console.log(`\n  🔶 Circuit breaker stats: ${cbStats.open} open, ${cbStats.halfOpen} half-open, ${cbStats.closed} closed`);

  // Summary
  console.log(`\n📊 Extraction Summary:`);
  console.log(`  ✅ Successful: ${results.length}`);
  console.log(`  📦 From cache: ${results.filter(r => r.fromCache).length}`);
  console.log(`  ⏭️  Skipped (circuit): ${skipped.length}`);
  console.log(`  ❌ Failed: ${failed.length}`);
  console.log(`  📊 Total processed: ${urls.length}\n`);

  // Log some failed URLs for debugging
  if (failed.length > 0 && failed.length <= 10) {
    console.log(`  Failed URLs:`);
    failed.forEach(f => console.log(`    - ${f.url}: ${f.error}`));
  }

  return results;
}

module.exports = { extractFromAllWebsites };
