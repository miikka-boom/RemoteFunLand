#!/usr/bin/env node
// Capture <slug>/thumb.jpg for the gallery. The gallery shows it cropped to 16:10.
//
// Usage: node tools/thumb.cjs <slug> [--click "<selector>"] [--wait <ms>] [--el "<selector>"]
//   --click  element to click first, e.g. a Play button (a real click, so audio can start)
//   --wait   milliseconds to wait before capturing (default 1500)
//   --el     capture only this element instead of the 1200×750 viewport
//
// Uses the Playwright + Chromium that come preinstalled in Claude Code cloud sessions.
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || slug.startsWith('--')) {
  console.error('Usage: node tools/thumb.cjs <slug> [--click "<selector>"] [--wait <ms>] [--el "<selector>"]');
  process.exit(1);
}
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};

const root = path.resolve(__dirname, '..');
const out = path.join(root, slug, 'thumb.jpg');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file://' + path.join(root, slug, 'index.html'));
  if (opt('--click')) await page.click(opt('--click'));
  await page.waitForTimeout(Number(opt('--wait') || 1500));

  const shot = { path: out, type: 'jpeg', quality: 80 };
  if (opt('--el')) await page.locator(opt('--el')).screenshot(shot);
  else await page.screenshot(shot);

  console.log('wrote ' + path.relative(root, out));
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  await browser.close();
})();
