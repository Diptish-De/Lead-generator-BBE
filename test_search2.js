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

  try {
    console.log("Testing Bing...");
    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {waitUntil: 'domcontentloaded', timeout: 15000});
    await new Promise(r => setTimeout(r, 2000));
    const bingLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('h2 a')).map(a => a.href).filter(h => h && h.startsWith('http') && !h.includes('bing.com'));
      return links.length;
    });
    console.log("Bing links count: " + bingLinks);
  } catch(e) { console.log(e.message); }

  try {
    console.log("Testing Yahoo...");
    await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {waitUntil: 'domcontentloaded', timeout: 15000});
    await new Promise(r => setTimeout(r, 2000));
    const yahooLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('.algo-title, .title a, a')).map(a => a.href).filter(h => h && h.startsWith('http') && !h.includes('yahoo.com'));
      return links.length;
    });
    console.log("Yahoo links count: " + yahooLinks);
  } catch(e) { console.log(e.message); }

  await browser.close();
}
testEngines().catch(console.error);
