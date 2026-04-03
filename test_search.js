const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function testEngines() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  
  const query = "Home Decor Boutiques UK";

  console.log("Testing DuckDuckGo Lite...");
  await page.goto(`https://lite.duckduckgo.com/lite/`, {waitUntil: 'domcontentloaded'});
  await page.type('.query', query);
  await page.click('.search_button');
  await page.waitForNavigation({waitUntil: 'domcontentloaded'});
  const ddgLinks = await page.evaluate(() => Array.from(document.querySelectorAll('.result-snippet')).length > 0 ? "Found" : "Not Found");
  console.log("DDG Lite: " + ddgLinks);

  console.log("Testing Bing...");
  await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {waitUntil: 'domcontentloaded'});
  await new Promise(r => setTimeout(r, 2000));
  const bingLinks = await page.evaluate(() => document.querySelectorAll('h2 a').length);
  console.log("Bing links count: " + bingLinks);

  console.log("Testing Yahoo...");
  await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {waitUntil: 'domcontentloaded'});
  await new Promise(r => setTimeout(r, 2000));
  const yahooLinks = await page.evaluate(() => document.querySelectorAll('.algo-title').length || document.querySelectorAll('.title a').length);
  console.log("Yahoo links count: " + yahooLinks);

  await browser.close();
}
testEngines().catch(console.error);
