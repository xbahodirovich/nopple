import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.renderedDraws = 0;
    const original = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      window.renderedDraws++;
      return original.apply(this, args);
    };
  });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.is-ready').waitFor();
  await page.waitForTimeout(250);
  const initialDraws = await page.evaluate(() => window.renderedDraws);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.renderedDraws), initialDraws, 'Idle renderer must stop drawing');
  async function scrub(progress) {
    await page.evaluate(p => {
      const hero = document.querySelector('.hero');
      const story = document.querySelector('.hero-story');
      const start = story.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(hero).top);
      scrollTo({ top: start + (story.offsetHeight - hero.offsetHeight) * p, behavior: 'instant' });
    }, progress);
    await page.waitForTimeout(250);
  }
  await scrub(.3);
  const forward = await page.locator('canvas').screenshot();
  await scrub(.8);
  await scrub(.3);
  const reverse = await page.locator('canvas').screenshot();
  assert.deepEqual(reverse, forward, 'Same offset must produce the identical house pixels in both directions');
  const stationaryDraws = await page.evaluate(() => window.renderedDraws);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.renderedDraws), stationaryDraws);
  await page.evaluate(() => document.querySelector('#start').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(250);
  const hiddenDraws = await page.evaluate(() => window.renderedDraws);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.renderedDraws), hiddenDraws);
  await scrub(.5);
  assert.ok(await page.evaluate(() => window.renderedDraws) > hiddenDraws);
  await page.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByText('Your home, in plan.').waitFor();
  assert.equal(await page.locator('#scene-viewport canvas').count(), 0);
  assert.equal(await page.locator('.hero-story').evaluate(el => getComputedStyle(el).minHeight), '0px');
  assert.deepEqual(errors, []);
  console.log('Reversible pixels, idle/offscreen rendering suspension, resume, and context loss passed.');
} finally { await browser.close(); }
