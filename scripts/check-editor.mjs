import { chromium } from '@playwright/test';
import { createServer } from 'vite';

async function testEditor() {
  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5174 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Server listening at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    console.log('Navigating to /editor.html...');
    await page.goto(`${baseUrl}/editor.html`, { waitUntil: 'networkidle' });

    // 1. Check title and canvas mounts
    const title = await page.title();
    console.log(`Page title: "${title}"`);
    if (!title.includes('Mopple Studio')) throw new Error(`Unexpected title: ${title}`);

    const has2D = await page.$eval('.mopple-canvas-2d', el => !!el);
    const has3D = await page.$eval('.mopple-canvas-3d', el => !!el);
    console.log(`Canvas 2D mounted: ${has2D}, Canvas 3D mounted: ${has3D}`);
    if (!has2D || !has3D) throw new Error('Canvases failed to mount');

    // 2. Check layers tree
    const roomItems = await page.$$eval('.layer-item[data-type="room"]', els => els.length);
    const objItems = await page.$$eval('.layer-item[data-type="object"]', els => els.length);
    console.log(`Layers panel rendered: ${roomItems} rooms, ${objItems} objects`);
    if (roomItems < 1 || objItems < 1) throw new Error('Layers tree empty');

    // 3. Test selection by clicking a layer item
    console.log('Clicking first object in layers...');
    await page.click('.layer-item[data-type="object"]');
    await page.waitForTimeout(300);

    const propHeader = await page.$eval('.panel-properties .panel-title', el => el.textContent);
    console.log(`Property header after selection: "${propHeader}"`);
    if (!propHeader || propHeader === 'PROJECT INSPECTOR') throw new Error('Property inspector did not update on selection');

    // 4. Test View Switching
    console.log('Testing view mode switcher...');
    await page.click('.view-tab[data-view="2d"]');
    await page.waitForTimeout(200);
    const is3dHidden = await page.$eval('#pane-3d', el => el.classList.contains('hidden'));
    console.log(`In 2D mode, 3D pane is hidden: ${is3dHidden}`);
    if (!is3dHidden) throw new Error('3D pane should be hidden in 2D mode');

    await page.click('.view-tab[data-view="3d"]');
    await page.waitForTimeout(200);
    const is2dHidden = await page.$eval('#pane-2d', el => el.classList.contains('hidden'));
    console.log(`In 3D mode, 2D pane is hidden: ${is2dHidden}`);
    if (!is2dHidden) throw new Error('2D pane should be hidden in 3D mode');

    await page.click('.view-tab[data-view="split"]');
    await page.waitForTimeout(200);

    // 5. Test AI Prompt execution via chip
    console.log('Testing AI prompt execution (Make bedroom larger)...');
    await page.click('.ai-chip[data-prompt="make the bedroom larger by 1m"]');
    await page.waitForTimeout(600);

    const aiStatus = await page.$eval('#ai-status', el => el.textContent);
    console.log(`AI status message: "${aiStatus}"`);
    if (!aiStatus.includes('Applied') && !aiStatus.includes('Executed')) {
      throw new Error(`AI execution did not report success: ${aiStatus}`);
    }

    // 6. Test Undo
    console.log('Testing Undo button...');
    const canUndoBefore = await page.$eval('#btn-undo', el => !el.disabled);
    console.log(`Can undo before: ${canUndoBefore}`);
    if (!canUndoBefore) throw new Error('Undo button should be enabled after AI operation');

    await page.click('#btn-undo');
    await page.waitForTimeout(300);

    const canRedoAfterUndo = await page.$eval('#btn-redo', el => !el.disabled);
    console.log(`Can redo after undo: ${canRedoAfterUndo}`);
    if (!canRedoAfterUndo) throw new Error('Redo button should be enabled after undo');

    // 7. Test Redo
    await page.click('#btn-redo');
    await page.waitForTimeout(300);

    // 8. Test Keyboard Shortcut (Escape to deselect)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const propHeaderAfterEsc = await page.$eval('.panel-properties .panel-title', el => el.textContent);
    console.log(`Property header after Escape: "${propHeaderAfterEsc}"`);
    if (propHeaderAfterEsc.toUpperCase() !== 'PROJECT INSPECTOR') throw new Error('Escape should return to Project Inspector');

    // 9. Check console errors
    console.log(`Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('Console errors encountered:', consoleErrors);
      throw new Error(`Found ${consoleErrors.length} console errors: ${consoleErrors.join('; ')}`);
    }

    console.log('All interactive editor tests PASSED successfully!');
  } finally {
    await browser.close();
    await server.close();
  }
}

testEditor().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
