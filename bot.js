const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'http://43.159.60.190:20128/';
const AKUN_FILE = path.join(__dirname, 'akun.txt');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Helper: click element by visible text
async function clickByText(page, text, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const clicked = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find(b => b.textContent.trim().includes(t));
      if (el) { el.click(); return true; }
      return false;
    }, text);
    if (clicked) return true;
    await sleep(500);
  }
  throw new Error(`Button with text "${text}" not found within ${timeout}ms`);
}

// Helper: wait for selector with fallback to text
async function waitAndClick(page, selector, textFallback, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout: timeout / 2 });
    await page.click(selector);
    return;
  } catch (e) {
    // Fallback to text-based click
    await clickByText(page, textFallback, timeout / 2);
  }
}

function readAccounts() {
  const content = fs.readFileSync(AKUN_FILE, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => {
    const [email, password] = line.trim().split('|');
    return { email, password, raw: line.trim() };
  }).filter((a) => a.email && a.password);
}

function removeAccount(rawLine) {
  const content = fs.readFileSync(AKUN_FILE, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== rawLine);
  fs.writeFileSync(AKUN_FILE, lines.join('\n'));
}

async function loginAccount(account, index, total) {
  const { email, password } = account;
  console.log('\n=== Account ' + (index + 1) + '/' + total + ': ' + email + ' ===');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to ' + TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Step 1: Click Providers in sidebar
    console.log('Clicking Providers...');
    await waitAndClick(page, 'a[href*="/providers"]', 'Providers', 10000);
    await sleep(2000);

    // Step 2: Click Antigravity provider card
    console.log('Clicking Antigravity...');
    await clickByText(page, 'Antigravity', 10000);
    await sleep(2000);

    // Step 3: Click Add Connection button
    console.log('Clicking Add Connection...');
    await clickByText(page, 'Add Connection', 10000);
    await sleep(2000);

    // Step 4: Confirm (I Understand)
    console.log('Clicking I Understand...');
    await clickByText(page, 'I Understand', 10000);
    await sleep(5000);

    // Step 5: Handle new tab (Google OAuth)
    console.log('Waiting for OAuth tab...');
    const pages = await browser.pages();
    const newTab = pages[pages.length - 1];
    await newTab.bringToFront();

    // Email
    console.log('Typing email: ' + email);
    await newTab.waitForSelector('#identifierId', { timeout: 15000 });
    await newTab.type('#identifierId', email);
    await sleep(500);

    console.log('Clicking Next (email)...');
    await clickByText(newTab, 'Next', 10000);
    await sleep(3000);

    // Password
    console.log('Waiting for password field...');
    await newTab.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });
    await sleep(1000);
    await newTab.type('input[type="password"]', password);

    console.log('Clicking Next (password)...');
    await clickByText(newTab, 'Next', 10000);
    await sleep(3000);

    // I Understand (Kiro TOS)
    console.log('Clicking I Understand (TOS)...');
    await clickByText(newTab, 'I Understand', 15000);
    await sleep(1000);

    // Login/Submit
    console.log('Clicking Login...');
    await clickByText(newTab, 'Login', 10000);
    await sleep(2000);

    console.log('Account ' + (index + 1) + ' login successful!');
    removeAccount(account.raw);
    console.log('Removed from akun.txt: ' + email);

  } catch (err) {
    console.error('ERROR for ' + email + ': ' + err.message);
    try {
      await page.screenshot({ path: path.join(__dirname, 'error-' + index + '.png') });
      console.log('Error screenshot saved: error-' + index + '.png');
    } catch (e) {}
  }

  await sleep(3000);
  await browser.close();
  console.log('Browser closed.');
}

(async () => {
  const accounts = readAccounts();
  console.log('Total accounts: ' + accounts.length);

  for (let i = 0; i < accounts.length; i++) {
    await loginAccount(accounts[i], i, accounts.length);

    if (i < accounts.length - 1) {
      console.log('Delay 3 seconds before next account...');
      await sleep(3000);
    }
  }

  console.log('\nAll ' + accounts.length + ' accounts added successfully!');
})();
