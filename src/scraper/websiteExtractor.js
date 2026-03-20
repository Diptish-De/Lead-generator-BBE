const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const config = require('../config');

// ── Helpers ────────────────────────────────────────────────────────
function randomDelay([min, max]) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUserAgent() {
  return config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
}

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
      if (data.name && data.name.length < 80) return cleanCompanyName(data.name);
      if (data.organization?.name) return cleanCompanyName(data.organization.name);
    } catch {}
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

// ── Location Extraction ────────────────────────────────────────────
function extractLocation($, text) {
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
    } catch {}
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

    const hostname = new URL(text.includes('http') ? text : `http://${text}`).hostname || '';
    for (const [tld, c] of Object.entries(tldMap)) {
      if (hostname.endsWith(tld)) {
        country = c;
        break;
      }
    }
  } catch {}

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
  const contactPatterns = /\b(contact|about|about-us|contact-us|get-in-touch|reach-us|our-story|team)\b/i;

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const fullUrl = new URL(href, baseUrl).href;
      const path = new URL(fullUrl).pathname.toLowerCase();

      if (contactPatterns.test(path) && fullUrl.startsWith('http')) {
        pages.push(fullUrl);
      }
    } catch {}
  });

  return [...new Set(pages)].slice(0, config.maxPagesToCheck);
}

// ── Extract All Data from a Single Website ─────────────────────────
async function extractFromWebsite(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(randomUserAgent());
  await page.setViewport({ width: 1366, height: 768 });

  // Block images, fonts, media for speed
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
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
    pageText: '',
    html: '',
  };

  try {
    // Visit main page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.siteTimeout });
    await new Promise(r => setTimeout(r, 1500));

    let html = await page.content();
    let $ = cheerio.load(html);
    let text = $('body').text().replace(/\s+/g, ' ');

    data.companyName = extractCompanyName($, url);
    data.emails.push(...extractEmails(text));
    data.emails.push(...extractEmails(html)); // Also check raw HTML for mailto: links
    data.phones.push(...extractPhones(text));
    data.instagram = extractInstagram(text, html);
    const loc = extractLocation($, url);
    data.city = loc.city;
    data.country = loc.country;
    data.pageText = text.slice(0, 5000); // Keep first 5000 chars for analysis
    data.html = html;

    // Find and visit contact/about pages
    const subPages = findSubPages($, url);

    for (const subUrl of subPages) {
      try {
        await page.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: config.siteTimeout });
        await new Promise(r => setTimeout(r, 1000));

        html = await page.content();
        $ = cheerio.load(html);
        text = $('body').text().replace(/\s+/g, ' ');

        // Merge new findings
        data.emails.push(...extractEmails(text));
        data.emails.push(...extractEmails(html));
        data.phones.push(...extractPhones(text));
        if (!data.instagram) data.instagram = extractInstagram(text, html);

        const subLoc = extractLocation($, subUrl);
        if (!data.city && subLoc.city) data.city = subLoc.city;
        if (!data.country && subLoc.country) data.country = subLoc.country;

        data.pageText += ' ' + text.slice(0, 3000);
      } catch {
        // Skip failed sub-pages silently
      }
    }

    // Extract mailto: links specifically
    const mailtoEmails = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi) || [];
    mailtoEmails.forEach(m => {
      const email = m.replace('mailto:', '').toLowerCase();
      data.emails.push(email);
    });

    // Deduplicate
    data.emails = [...new Set(data.emails.map(e => e.toLowerCase()))];
    data.phones = [...new Set(data.phones)];

    // Re-filter junk emails after dedup
    data.emails = data.emails.filter(email => {
      const prefix = email.split('@')[0];
      return !config.junkEmailPrefixes.some(junk => prefix === junk || prefix.startsWith(junk));
    });

  } catch (err) {
    console.log(`    ⚠️  Failed to extract from ${url}: ${err.message}`);
  } finally {
    await page.close();
  }

  return data;
}

// ── Main: Visit all URLs and extract data ──────────────────────────
async function extractFromAllWebsites(urls) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 STEP 2: Visiting websites & extracting data...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const domain = new URL(url).hostname.replace(/^www\./, '');
    console.log(`  [${i + 1}/${urls.length}] 🔗 ${domain}`);

    try {
      const data = await extractFromWebsite(browser, url);
      results.push(data);

      const emailCount = data.emails.length;
      const phoneCount = data.phones.length;
      console.log(`    📧 ${emailCount} email(s), 📞 ${phoneCount} phone(s), 📍 ${data.country || '?'}\n`);
    } catch (err) {
      console.log(`    ❌ Skipped: ${err.message}\n`);
    }

    // Delay between sites
    if (i < urls.length - 1) {
      const delay = randomDelay(config.delayBetweenSites);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await browser.close();

  console.log(`\n📊 Successfully extracted data from ${results.length}/${urls.length} sites\n`);
  return results;
}

module.exports = { extractFromAllWebsites };
