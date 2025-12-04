import puppeteer from 'puppeteer';

async function testPuppeteer() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Set to true for headless mode
  });

  const page = await browser.newPage();

  console.log('Navigating to example.com...');
  await page.goto('https://example.com');

  const title = await page.title();
  console.log('Page title:', title);

  // Take a screenshot
  await page.screenshot({ path: 'screenshot.png' });
  console.log('Screenshot saved as screenshot.png');

  // Get page content
  const heading = await page.$eval('h1', el => el.textContent);
  console.log('H1 content:', heading);

  await browser.close();
  console.log('Browser closed. Test complete!');
}

testPuppeteer().catch(console.error);
