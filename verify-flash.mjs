/**
 * Does /app/login ever paint the app shell before it paints the login form?
 *
 * The control plane is stubbed rather than run: a real /auth/me answers in a
 * few ms on a laptop, which is exactly the case that hides this bug. Delaying
 * it is what a cold connection over a real network looks like.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const AUTH = 'http://localhost:8000';
const DELAY = 1200;

// Set before any app code runs: catch the shell even if it lives one frame.
const WATCH = `
  window.__sawShell = null;
  const look = () => {
    if (window.__sawShell) return;
    const a = document.querySelector('aside');
    if (a) window.__sawShell = (a.innerText || '').slice(0, 60).replace(/\s+/g, ' ');
  };
  new MutationObserver(look).observe(document.documentElement, { childList: true, subtree: true });
  const t = setInterval(look, 4);
  setTimeout(() => clearInterval(t), 8000);
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stub(page, { user, fail = false }) {
  await page.route(`${AUTH}/**`, async (route) => {
    await sleep(DELAY);
    if (fail) return route.abort('failed');
    const u = route.request().url();
    const body = u.includes('/auth/me') ? { user }
      : u.includes('/auth/csrf') ? { csrfToken: 'stub' }
      : u.includes('/auth/executor-token') ? { token: 'stub', expiresIn: 300 }
      : u.includes('/auth/sso/providers') ? { google: { enabled: false } }
      : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function probe(name, path, opts) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(WATCH);
  await stub(page, opts);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(DELAY + 1500);
  const shell = await page.evaluate(() => window.__sawShell);
  const mounted = await page.evaluate(() => document.querySelector('#app')?.children.length > 0);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 90);
  await browser.close();
  return { name, shell, mounted, text, errors };
}

const results = [];
results.push({ ...(await probe('anonymous -> /app/login', '/app/login', { user: null })), wantShell: false, wantMounted: true });
results.push({ ...(await probe('anonymous -> /app/dashboard', '/app/dashboard', { user: null })), wantShell: false, wantMounted: true });
results.push({ ...(await probe('signed in -> /app/dashboard', '/app/dashboard', { user: { email: 'q@e.com' } })), wantShell: true, wantMounted: true });
results.push({ ...(await probe('control plane DOWN -> /app/login', '/app/login', { user: null, fail: true })), wantShell: false, wantMounted: true });

let bad = 0;
for (const r of results) {
  const shellOk = !!r.shell === r.wantShell;
  const mountOk = r.mounted === r.wantMounted;
  const ok = shellOk && mountOk && r.errors.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${r.name.padEnd(30)} shell=${r.shell ? JSON.stringify(r.shell) : 'never'} mounted=${r.mounted}`);
  console.log(`        body: "${r.text}"`);
  if (r.errors.length) console.log(`        pageerror: ${r.errors.join(' | ')}`);
}
console.log(bad ? `\n  ${bad} FAILED\n` : '\n  all clear\n');
process.exit(bad ? 1 : 0);
