require('dotenv').config();

module.exports = {
  // ── Search Queries (Export Business — target importers & buyers) ──
  searchQueries: [
    // B2B Trade Portals — where importers look for exporters
    'site:tradekey.com "handicraft" OR "home decor" importers buyers contact',
    'site:go4worldbusiness.com "handicraft" OR "home decor" importers',
    'site:exportersindia.com "handicraft" OR "furniture" buyers',
    'site:tradeindia.com "home decor" OR "handicraft" buy leads',
    'site:fibre2fashion.com home decor furnishing buyers importers',
    // Direct importer search queries
    'home decor importers USA contact email wholesale',
    'handicraft importers Europe wholesale buyers email',
    'furniture importers UK wholesale contact',
    'artisan home decor wholesale buyers Canada contact',
    'Indian handicraft wholesale buyers Australia contact email',
    'bulk home decor buyers USA wholesale inquiry',
    'import handicraft from India wholesale distributors',
    'fair trade home decor importers Europe email',
    'handmade furniture importers USA wholesale',
    'ethnic decor wholesale buyers UK contact email',
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
  domainCacheFile: 'output/scraped_domains.json',

  // ── CSV Column Headers ─────────────────────────────────────────
  csvHeaders: [
    'Company Name', 'Website', 'Email', 'Email Valid', 'Country', 'City',
    'Business Type', 'Product Style', 'Target Audience',
    'Instagram', 'Phone', 'Decision Maker', 'Notes', 'Lead Score', 'Chance', 'Date Scraped',
    'Status', 'Emailed', 'Last Contacted',
    // Outreach fields
    'Assigned Email', 'Sent At', 'Last Follow-up', 'Contact Name'
  ],

  // ── Performance Settings ────────────────────────────────────────
  scrapingConcurrency: 3,          // Number of websites to scrape in parallel
  maxPagesToCheck: 3,               // Visit up to 3 sub-pages (Contact, About, etc.)
  enableDomainCache: true,          // Skip recently scraped domains (7-day cache)
  maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxCacheSize: 10000,             // Max domains to cache
  maxCircuits: 1000,               // Max circuit breaker entries (prevents memory leak)

  // ── Extraction Settings ────────────────────────────────────────
  socialMediaPlatforms: ['instagram', 'facebook', 'pinterest', 'linkedin'],
  extractMetaTags: true,            // Get description/keywords for better scoring
  maxRetries: 3,                    // Max retry attempts for failed requests
  retryBaseDelay: 1000,            // Base delay in ms (doubles each retry)
  retryMaxDelay: 10000,            // Max delay cap in ms
  circuitBreakerThreshold: 5,      // Failures before circuit opens
  circuitBreakerReset: 60000,      // Circuit reset time in ms (1 minute)
  siteTimeout: 15000,              // Timeout per site in ms
};
