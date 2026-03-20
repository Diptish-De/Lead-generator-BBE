require('dotenv').config();

module.exports = {
  // ── Search Queries ──────────────────────────────────────────────
  searchQueries: [
    'home decor store USA contact email',
    'interior designer Europe contact us',
    'boutique decor shop UK email',
    'museum gift shop USA contact',
    'handmade home decor store contact email',
    'luxury home accessories boutique contact',
    'artisan decor shop Europe email',
    'handicraft retail store USA contact',
  ],

  // ── Scraping Settings ──────────────────────────────────────────
  maxResultsPerQuery: 15,
  delayBetweenSearches: [4000, 8000],   // ms range (random)
  delayBetweenSites: [3000, 6000],      // ms range (random)
  siteTimeout: 15000,                    // 15s per site
  maxPagesToCheck: 3,                    // homepage + contact + about

  // ── Blocked Domains (skip these) ───────────────────────────────
  blockedDomains: [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'linkedin.com', 'pinterest.com', 'youtube.com', 'tiktok.com',
    'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com',
    'wikipedia.org', 'yelp.com', 'tripadvisor.com',
    'reddit.com', 'quora.com', 'medium.com',
    'google.com', 'bing.com', 'yahoo.com',
    'alibaba.com', 'aliexpress.com', 'indiamart.com',
    'craigslist.org', 'yellowpages.com', 'bbb.org',
  ],

  // ── Junk Emails (filter these out) ─────────────────────────────
  junkEmailPrefixes: [
    'noreply', 'no-reply', 'admin', 'webmaster', 'postmaster',
    'mailer-daemon', 'root', 'hostmaster', 'abuse',
    'donotreply', 'do-not-reply', 'newsletter', 'unsubscribe',
  ],

  // ── User Agents (rotation) ─────────────────────────────────────
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  ],

  // ── Google Sheet Config ────────────────────────────────────────
  spreadsheetId: '1kYExdz-8bJR2c4fT--f564PXZQh2RwcU5eg51fmded4',
  appsScriptUrl: process.env.APPS_SCRIPT_URL || '',

  // ── Output ─────────────────────────────────────────────────────
  outputDir: 'output',
  outputFile: 'output/leads.csv',

  // ── CSV Column Headers ─────────────────────────────────────────
  csvHeaders: [
    'Company Name', 'Website', 'Email', 'Country', 'City',
    'Business Type', 'Product Style', 'Target Audience',
    'Instagram', 'Phone', 'Notes', 'Lead Score', 'Chance',
  ],
};
