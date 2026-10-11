import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5174, host: '127.0.0.1' } });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.editorDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) { window.editorDraws++; return draw.apply(this, args); };
  });
  await page.goto(`http://127.0.0.1:${port}/advanced`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('canvas').count(), 2);
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 4);
  assert.equal(await page.evaluate(async () => (await fetch('/api/ai/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status), 401);

  // Scale is committed, restored by undo, and remains visible after selection changes.
  await page.locator('.layer-item[data-id="object_sofa"]').click();
  await page.locator('#prop-scale-x').fill('2'); await page.locator('#prop-scale-x').press('Tab');
  await page.locator('.layer-item[data-type="room"]').first().click();
  await page.locator('.layer-item[data-id="object_sofa"]').click();
  assert.equal(await page.locator('#prop-scale-x').inputValue(), '2');
  await page.locator('#project-title').fill('Renamed home'); await page.locator('#project-title').press('Tab');
  await page.locator('#btn-undo').click();
  assert.equal(await page.locator('#project-title').inputValue(), 'Modern House');
  assert.equal(await page.locator('#btn-undo').isEnabled(), true);
  await page.locator('#btn-undo').click();
  await page.locator('.layer-item[data-id="object_sofa"]').click();
  assert.equal(await page.locator('#prop-scale-x').inputValue(), '1');
  await page.keyboard.press('Escape');

  // Common offline commands edit the expected entity.
  async function prompt(text) {
    await page.locator('#ai-prompt-input').fill(text);
    await page.locator('#btn-ai-submit').click();
    await page.locator('#change-review[open]').waitFor();
    await page.locator('#change-apply').click();
    await page.locator('#ai-status.success').waitFor();
  }
  await prompt('move the sofa 1m left');
  assert.equal(await page.locator('.layer-item[data-type="object"]').count(), 6);
  await prompt('add a chair to the bedroom');
  assert.equal(await page.locator('.layer-item[data-type="object"]').count(), 7);
  await page.locator('#ai-prompt-input').fill('create a modern 150m² house with 3 bedrooms and 2 bathrooms');
  await page.locator('#btn-ai-submit').click();
  await page.locator('.brief-dialog[open]').waitFor();
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 4, 'brief does not create geometry');
  for (const key of ['style', 'site', 'household', 'spaces', 'materials', 'budget', 'lighting', 'interiorViews']) {
    await page.locator(`#brief-${key}`).fill(key === 'spaces' ? 'Office, courtyard, and a reading room' : 'No preference');
  }
  await page.locator('#brief-next').click();
  await page.locator('#brief-review').waitFor();
  assert.equal(await page.locator('#brief-review-title').evaluate(el => document.activeElement === el), true, 'review begins at its heading for keyboard users');
  await page.locator('#brief-next').click();
  assert.match(await page.locator('#brief-error').textContent(), /check the confirmation/);
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({ path: '.impeccable/review/brief-review-desktop.png' });
  await page.locator('#brief-confirm').check();
  await page.locator('#brief-next').click();
  await page.locator('.brief-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 11);
  // pagehide must flush the latest design before the debounce expires.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mopple_editor_project')));
  assert.equal(saved.building.rooms.filter(r => r.type === 'bedroom').length, 3);
  assert.equal(saved.metadata.designBrief.spaces, 'Office, courtyard, and a reading room');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-render-plan').click();
  const download = await downloadPromise;
  const plan = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(plan.interiorJobs[0].status, 'not_implemented');
  assert.equal(plan.brief.spaces, saved.metadata.designBrief.spaces);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 11);

  assert.equal(await page.locator('#btn-geo, #modal-geo, #geo-map-canvas').count(), 0);
  await page.locator('#btn-solar').click();
  await page.locator('#solar-study-panel').evaluate(el => el.style.visibility = 'hidden');
  const beforeSun = await page.locator('#pane-3d canvas').screenshot();
  await page.locator('#solar-study-panel').evaluate(el => el.style.visibility = '');
  await page.locator('#sun-azimuth').fill('90');
  await page.locator('#sun-azimuth').dispatchEvent('change');
  assert.equal(await page.locator('#sun-azimuth-value').textContent(), '90°');
  await page.locator('#solar-study-panel').evaluate(el => el.style.visibility = 'hidden');
  assert.notDeepEqual(await page.locator('#pane-3d canvas').screenshot(), beforeSun, 'sun direction changes the rendered scene without HUD labels');
  await page.locator('#solar-study-panel').evaluate(el => el.style.visibility = '');
  await page.locator('#sun-elevation').fill('20');
  await page.locator('#sun-elevation').dispatchEvent('change');
  await page.locator('#sun-warmth').fill('65');
  await page.locator('#sun-warmth').dispatchEvent('change');
  assert.equal(await page.locator('#sun-warmth-value').textContent(), '65%');
  await page.locator('#sun-intensity').fill('3.5');
  await page.locator('#sun-intensity').dispatchEvent('change');
  assert.equal(await page.locator('#sun-intensity-value').textContent(), '3.5');
  await page.locator('#btn-undo').click();
  assert.equal(await page.locator('#sun-intensity').inputValue(), '2.8');
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#btn-solar').click();
  assert.equal(await page.locator('#sun-azimuth').inputValue(), '90');
  await page.locator('#solar-close-btn').click();

  // Viewport cutaway and render gallery dialog
  await page.locator('#hud-view-cutaway').click();
  await page.locator('#btn-open-gallery').click();
  await page.locator('.gallery-dialog[open]').waitFor();
  assert.ok(await page.locator('.gallery-card').count() >= 1);
  await page.locator('#gallery-btn-close').click();
  await page.locator('.gallery-dialog').waitFor({ state: 'hidden' });

  // Imported HTML remains text even in attributes and selected room headers.
  const imported = JSON.parse(await readFile('examples/modern-house.mopple', 'utf8'));
  imported.building.rooms[0].name = '<img src=x onerror="window.injected=true">';
  imported.project.name = '\"><img src=x onerror="window.injected=true">';
  await page.locator('input[type=file][accept*=".mopple"]').setInputFiles({ name: 'test.mopple', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.locator('.layer-item[data-id="room_kitchen"]').click();
  assert.equal(await page.locator('#prop-room-name').inputValue(), imported.building.rooms[0].name);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('#layers-container img, #properties-container img').count(), 0);
  await page.keyboard.press('Escape');

  // Local requests preview first and never contact an AI provider.
  let aiRequests = 0;
  page.on('request', request => { if(request.url().includes('/api/ai/'))aiRequests++; });
  await page.locator('#ai-prompt-input').fill('remove the sofa'); await page.locator('#btn-ai-submit').click();
  await page.locator('#change-review[open]').waitFor();
  assert.equal(await page.locator('.layer-item[data-id="object_sofa"]').count(), 1);
  await page.locator('#change-apply').click();
  assert.equal(await page.locator('.layer-item[data-id="object_sofa"]').count(), 0);
  assert.equal(aiRequests, 0);

  await page.locator('input[type=file][accept*=".mopple"]').setInputFiles({ name: 'modern-house.mopple', mimeType: 'application/json', buffer: Buffer.from(await readFile('examples/modern-house.mopple', 'utf8')) });
  await page.locator('#hud-reset').click();
  await page.waitForTimeout(100);
  const draws = await page.evaluate(() => window.editorDraws);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.editorDraws), draws, '3D stops drawing when idle');
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({ path: '.impeccable/review/editor-desktop.png' });
  await page.locator('#btn-house-brief').click();
  await page.screenshot({ path: '.impeccable/review/brief-desktop.png' });
  await page.locator('#brief-cancel').click();
  await page.locator('#btn-solar').click();
  await page.screenshot({ path: '.impeccable/review/sun-desktop.png' });
  await page.locator('#solar-close-btn').click();

  // Mobile keeps a usable canvas; both panels remain reachable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-view="2d"]').click();
  assert.ok(await page.locator('#pane-2d').evaluate(el => el.clientWidth) >= 350);
  await page.locator('[data-panel="layers-container"]').click();
  await page.locator('.layer-item[data-id="object_sofa"]').click();
  await page.locator('[data-panel="properties-container"]').click();
  assert.equal(await page.locator('#prop-scale-x').isVisible(), true);
  await page.locator('[data-panel="properties-container"]').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '.impeccable/review/editor-mobile.png' });
  await page.locator('#btn-house-brief').click();
  await page.screenshot({ path: '.impeccable/review/brief-mobile.png' });
  assert.ok(await page.locator('.brief-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.keyboard.press('Escape');
  await page.locator('#hud-solar-toggle').click();
  await page.screenshot({ path: '.impeccable/review/sun-mobile.png' });
  assert.ok(await page.locator('#solar-study-panel').evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.deepEqual(errors, []);
  console.log('Editor regression checks passed: scale, undo, reviewed generation, autosave, safe imports, local change previews, idle rendering, mobile panels.');
} finally { await browser?.close(); await server.close(); }
