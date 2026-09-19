import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = '.impeccable/review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.is-ready').waitFor();
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.header img').evaluate(img => img.complete && img.naturalWidth > 0));
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.ok(icon.includes('mopple-icon'));
  assert.equal((await page.request.get(new URL(icon, page.url()).href)).status(), 200);
  await page.screenshot({ path: `${out}/scroll-desktop.png` });

  async function scrub(progress) {
    await page.evaluate(p => {
      const hero = document.querySelector('.hero');
      const story = document.querySelector('.hero-story');
      const top = parseFloat(getComputedStyle(hero).top);
      const start = story.getBoundingClientRect().top + scrollY - top;
      scrollTo({ top: start + (story.offsetHeight - hero.offsetHeight) * p, behavior: 'instant' });
    }, progress);
    await page.waitForTimeout(200);
  }
  // Verify forward and reverse scroll on desktop, phone, tablet, and laptop.
  for (const width of [1440, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.waitForTimeout(150);
    for (const [progress, stage] of [[0, 0], [.5, 1], [1, 2], [.5, 1], [0, 0]]) {
      await scrub(progress);
      assert.equal(await page.locator('#scene-viewport').getAttribute('data-stage'), String(stage));
      const rect = await page.locator('#scene-viewport').boundingBox();
      assert.ok(rect.y >= 0 && rect.y + rect.height <= (width === 390 ? 844 : 1000), `Scene visible at ${width}, stage ${stage}`);
      if (width === 1440 || width === 390) await page.screenshot({ path: `${out}/scroll-${width}-${stage}.png` });
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('button[data-stage="2"]').click();
  await page.waitForFunction(() => document.querySelector('#scene-viewport').dataset.stage === '2');
  await page.waitForTimeout(1200);
  await page.locator('button[data-stage="0"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#scene-viewport').dataset.stage === '0');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'Design your first home' }).click();
  assert.equal(new URL(page.url()).hash, '#start');
  await page.getByRole('link', { name: 'Explore the demonstration' }).click();
  await page.waitForFunction(() => document.querySelector('#scene-viewport').dataset.stage === '2');
  assert.equal(new URL(page.url()).hash, '#demo');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.hero').evaluate(el => getComputedStyle(el).position), 'relative');
  for (const stage of [0, 1, 2]) {
    await page.locator(`button[data-stage="${stage}"]`).click();
    assert.equal(await page.locator('#scene-viewport').getAttribute('data-stage'), String(stage));
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#scene-viewport').getAttribute('data-stage'), '2', 'Reduced motion must not scrub');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#scene-viewport').getAttribute('data-stage'), '0', 'Re-enabling motion must resync the view and label to scroll position');

  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.goto('http://127.0.0.1:5173');
  await fallback.getByText('Your home, in plan.').waitFor();
  assert.equal(await fallback.locator('.hero-story').evaluate(el => getComputedStyle(el).minHeight), '0px');
  assert.ok(await fallback.locator('#fallback svg').isVisible());
  assert.deepEqual(errors, []);
  await writeFile(`${out}/checks.json`, JSON.stringify({ passed: true, errors, checks: ['official logo and favicon', 'four viewport widths', 'forward and reverse scroll', 'pinned scene visibility', 'stage buttons and keyboard navigation', 'reduced motion', 'CTA links', 'WebGL fallback', 'no horizontal overflow'] }, null, 2));
} finally { await browser.close(); }
console.log('Scroll-driven browser checks passed. Screenshots: .impeccable/review/');
