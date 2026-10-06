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
  await page.goto(`http://127.0.0.1:${port}/editor.html`, { waitUntil: 'networkidle' });
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
    await page.locator('#ai-status.success').waitFor();
  }
  await prompt('move the sofa 1m left');
  assert.equal(await page.locator('.layer-item[data-type="object"]').count(), 6);
  await prompt('add a chair to the bedroom');
  assert.equal(await page.locator('.layer-item[data-type="object"]').count(), 7);
  await prompt('create a modern 150m² house with 3 bedrooms and 2 bathrooms');
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 9);
  // pagehide must flush the latest design before the debounce expires.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mopple_editor_project')));
  assert.equal(saved.building.rooms.filter(r => r.type === 'bedroom').length, 3);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.layer-item[data-type="room"]').count(), 9);

  // Imported HTML remains text even in attributes and selected room headers.
  const imported = JSON.parse(await readFile('examples/modern-house.mopple', 'utf8'));
  imported.building.rooms[0].name = '<img src=x onerror="window.injected=true">';
  imported.project.name = '\"><img src=x onerror="window.injected=true">';
  await page.locator('input[type=file]').setInputFiles({ name: 'test.mopple', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.locator('.layer-item[data-id="room_kitchen"]').click();
  assert.equal(await page.locator('#prop-room-name').inputValue(), imported.building.rooms[0].name);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('#layers-container img, #properties-container img').count(), 0);
  await page.keyboard.press('Escape');

  // Provider failures are visible and fall back to the supported offline edit.
  await page.locator('#btn-apikey').click();
  await page.locator('#apikey-input').fill('nvapi-browser-test');
  await page.locator('#btn-save-apikey').click();
  await page.route('**/api/ai/operations', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid API key. Your design is unchanged.' }) }));
  await page.locator('#ai-prompt-input').fill('remove the sofa'); await page.locator('#btn-ai-submit').click();
  await page.locator('#ai-status.success').waitFor();
  assert.match(await page.locator('#ai-status').textContent(), /Invalid API key/);
  assert.equal(await page.locator('#ai-prompt-input').inputValue(), '');
  assert.equal(await page.locator('.layer-item[data-id="object_sofa"]').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('mopple_nim_api_key')), null);
  await page.unroute('**/api/ai/operations');
  await page.locator('#btn-apikey').click(); await page.locator('#apikey-input').fill(''); await page.locator('#btn-save-apikey').click();

  await page.locator('input[type=file]').setInputFiles({ name: 'modern-house.mopple', mimeType: 'application/json', buffer: Buffer.from(await readFile('examples/modern-house.mopple', 'utf8')) });
  await page.locator('#hud-reset').click();
  await page.waitForTimeout(100);
  const draws = await page.evaluate(() => window.editorDraws);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.editorDraws), draws, '3D stops drawing when idle');
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({ path: '.impeccable/review/editor-desktop.png' });

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
  assert.deepEqual(errors, []);
  console.log('Editor regression checks passed: scale, undo, house generation, autosave, safe imports, API errors, idle rendering, mobile panels.');
} finally { await browser?.close(); await server.close(); }
