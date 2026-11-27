import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const OUT_DIR = path.resolve('audit-output/responsive');

const VIEWPORTS = [
  { label: '320x568-portrait', width: 320, height: 568, orientation: 'portrait' },
  { label: '568x320-landscape', width: 568, height: 320, orientation: 'landscape' },
  { label: '360x740-portrait', width: 360, height: 740, orientation: 'portrait' },
  { label: '740x360-landscape', width: 740, height: 360, orientation: 'landscape' },
  { label: '390x844-portrait', width: 390, height: 844, orientation: 'portrait' },
  { label: '844x390-landscape', width: 844, height: 390, orientation: 'landscape' },
  { label: '412x915-portrait', width: 412, height: 915, orientation: 'portrait' },
  { label: '915x412-landscape', width: 915, height: 412, orientation: 'landscape' },
  { label: '768x1024-portrait', width: 768, height: 1024, orientation: 'portrait' },
  { label: '1024x768-landscape', width: 1024, height: 768, orientation: 'landscape' },
  { label: '820x1180-portrait', width: 820, height: 1180, orientation: 'portrait' },
  { label: '1180x820-landscape', width: 1180, height: 820, orientation: 'landscape' },
  { label: '1280x800-desktop', width: 1280, height: 800, orientation: 'landscape' },
  { label: '1440x900-desktop', width: 1440, height: 900, orientation: 'landscape' },
];

function makeCompressedShareHash(modelJson) {
  const model = JSON.parse(modelJson);
  const payload = JSON.stringify({
    version: 2,
    model,
    studio: { name: 'Atelier Nord' },
  });
  const gz = gzipSync(Buffer.from(payload, 'utf8'));
  const b64url = gz.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `#gz=${b64url}`;
}

function makeSeededHomes(modelJson) {
  const base = JSON.parse(modelJson);
  const second = structuredClone(base);
  second.project.id = 'project_second_demo';
  second.project.name = 'Courtyard Villa With Extended Terrace';
  return JSON.stringify([
    { id: base.project.id, name: base.project.name, model: base, versions: [base] },
    { id: second.project.id, name: second.project.name, model: second, versions: [] },
  ]);
}

const PAGES = [
  { id: 'landing', label: '/', path: '/' },
  { id: 'editor', label: '/editor', path: '/editor' },
  { id: 'advanced', label: '/advanced', path: '/advanced' },
  { id: 'homes', label: '/homes', path: '/homes' },
  { id: 'share', label: '/share', path: '/share' },
  { id: 'brief', label: 'brief-flow', path: '/advanced', openBrief: true },
];

async function waitForPageReady(page, pageDef) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (pageDef.id === 'editor') {
    await page.locator('.stage-header').waitFor({ timeout: 20000 });
    await page.waitForTimeout(250);
  } else if (pageDef.id === 'advanced' || pageDef.id === 'brief') {
    await page.locator('#editor-app').waitFor({ timeout: 20000 });
    await page.waitForTimeout(250);
    if (pageDef.openBrief) {
      try {
        await page.locator('#btn-house-brief').click({ timeout: 4000 });
      } catch {
        await page.evaluate(() => document.getElementById('btn-house-brief')?.click());
      }
      await page.locator('.brief-dialog[open]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(150);
    }
  } else if (pageDef.id === 'homes') {
    await page.locator('#homes[aria-busy="false"]').waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(150);
  } else if (pageDef.id === 'share') {
    await page.locator('#home-name').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => {
      const text = document.querySelector('#home-name')?.textContent ?? '';
      return text !== 'Shared home' || document.querySelector('#shared-view canvas') !== null;
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(200);
  } else {
    await page.waitForTimeout(150);
  }
}

async function runDomAudit(page, pageDef, viewport) {
  return page.evaluate(({ pageId, vpWidth, vpHeight }) => {
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (el.closest('[hidden]')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    };

    const describe = (el) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${tag}${id}${cls}${label ? ` ("${label}")` : ''}`;
    };

    const isIntentionallyOffscreen = (el) => {
      if (el.classList.contains('skip-link') || el.classList.contains('sr-only')) return true;
      if (el.id === 'waitlist-website' || el.closest('[aria-hidden="true"][style*="-10000px"]')) return true;
      return false;
    };

    // 1. Viewport meta tag
    const vpMeta = document.querySelector('meta[name="viewport"]');
    const viewportMeta = vpMeta
      ? { present: true, content: vpMeta.getAttribute('content') || '' }
      : { present: false, content: '' };

    // 2. Horizontal overflow
    const docEl = document.documentElement;
    const docOverflow = {
      scrollWidth: docEl.scrollWidth,
      innerWidth: window.innerWidth,
      overflowPx: Math.max(0, docEl.scrollWidth - window.innerWidth),
    };

    const bodyOverflow = {
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      overflowPx: Math.max(0, document.body.scrollWidth - window.innerWidth),
    };

    const hasClippedAncestor = (el) => {
      let cur = el.parentElement;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const st = getComputedStyle(cur);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(st.overflowX) || ['hidden', 'clip', 'auto', 'scroll'].includes(st.overflow)) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    // Also check open dialog / scroll containers for internal horizontal overflow
    const containerOverflows = [];
    for (const container of document.querySelectorAll('dialog[open], .workspace-tools, .architecture-controls, .options, .level-tabs')) {
      if (!isVisible(container)) continue;
      if (container.scrollWidth > container.clientWidth + 1) {
        containerOverflows.push({
          element: describe(container),
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth,
        });
      }
    }

    // 3. Elements outside viewport & elements causing horizontal overflow
    const outsideViewport = [];
    const overflowCauses = [];
    const seenOutside = new Set();
    const seenOverflow = new Set();

    const scopeRoot = pageId === 'brief'
      ? (document.querySelector('.brief-dialog[open]') || document.body)
      : document.body;

    const allElements = [scopeRoot, ...scopeRoot.querySelectorAll('*')];
    for (const el of allElements) {
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') continue;
      if (!isVisible(el) || isIntentionallyOffscreen(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const clipped = hasClippedAncestor(el);
      const outLeft = rect.left < -1;
      const outRight = rect.right > vpWidth + 1;
      const lockedShell = pageId === 'advanced' || pageId === 'share' || pageId === 'brief';
      const outTop = lockedShell && rect.top < -1;
      const outBottom = lockedShell && !el.closest('dialog[open]') && rect.bottom > vpHeight + 1;

      if ((outLeft || outRight) && !clipped) {
        const desc = describe(el);
        if (!seenOverflow.has(desc)) {
          seenOverflow.add(desc);
          overflowCauses.push({
            element: desc,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            vpWidth,
          });
        }
      }

      if (outLeft || outRight || outTop || outBottom) {
        // Skip decorative .hero-orbit on landing which intentionally bleeds right inside overflow:hidden .opening
        const desc = describe(el);
        if (!seenOutside.has(desc)) {
          seenOutside.add(desc);
          outsideViewport.push({
            element: desc,
            clippedByParent: clipped,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            vpWidth,
            vpHeight,
          });
        }
      }
    }

    // 4. Interactive elements < 44x44 on widths <= 1024
    const smallTouchTargets = [];
    if (vpWidth <= 1024) {
      const interactiveSelector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], label.dimension-toggle';
      for (const el of scopeRoot.querySelectorAll(interactiveSelector)) {
        if (!isVisible(el) || isIntentionallyOffscreen(el)) continue;
        // Skip visually-hidden checkbox inside label.dimension-toggle
        if (el.matches('input[type="checkbox"]') && el.closest('.dimension-toggle')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < 43.5 || rect.height < 43.5) {
          smallTouchTargets.push({
            element: describe(el),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          });
        }
      }
    }

    // 5. Inputs with font-size < 16px (triggers iOS Safari auto-zoom)
    const smallInputs = [];
    for (const el of scopeRoot.querySelectorAll('input, select, textarea')) {
      if (!isVisible(el) || isIntentionallyOffscreen(el)) continue;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'checkbox', 'radio', 'range', 'file'].includes(type)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) {
        smallInputs.push({
          element: describe(el),
          fontSize: Math.round(fs * 10) / 10,
        });
      }
    }

    // 6. Text under 12px
    const smallText = [];
    const seenSmallText = new Set();
    const walker = document.createTreeWalker(scopeRoot, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const txt = textNode.textContent?.trim();
      if (!txt) continue;
      const el = textNode.parentElement;
      if (!el || !isVisible(el) || isIntentionallyOffscreen(el)) continue;
      if (el.closest('svg')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.99) {
        const desc = `${describe(el)} @ ${Math.round(fs * 10) / 10}px`;
        if (!seenSmallText.has(desc)) {
          seenSmallText.add(desc);
          smallText.push({
            element: describe(el),
            fontSize: Math.round(fs * 10) / 10,
            sample: txt.slice(0, 40),
          });
        }
      }
    }

    // 7. Elements overlapping primary controls
    const primarySelectorsByPage = {
      landing: ['.nav-cta', '.language-control select', '.opening .start-button', '.site-footer #waitlist-email', '.site-footer button[type="submit"]'],
      editor: ['.stage-header button', '.view-tabs button', '.level-tabs button', '.plan-style-tabs button', '#reset-camera', '#edit-form button[type="submit"]', '.delivery-links button'],
      advanced: ['.top-bar button', '.top-bar a', '.top-bar input', '.view-switcher button', '.workspace-tools button', '.workspace-tools a', '.workspace-tools select', '.viewport-hud button', '.architecture-toolbar select', '.architecture-toolbar .dimension-toggle', '.measurement-schedule > summary', '#studio-composer button', '#studio-composer input'],
      homes: ['.product-header a', '#signin', '#homes-search', '.home-actions button', '.home-actions select'],
      share: ['.share-badge', '#studio-brand', '.share-controls button'],
      brief: ['#brief-close', '.brief-starters button', '.brief-tab', '#brief-cancel', '#brief-back', '#brief-next', '#brief-confirm'],
    };

    const overlaps = [];
    const primaryEls = [];
    for (const sel of primarySelectorsByPage[pageId] || []) {
      for (const el of scopeRoot.querySelectorAll(sel)) {
        if (isVisible(el)) primaryEls.push(el);
      }
    }

    for (const el of primaryEls) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Only hit-test points currently within the viewport
      if (cx >= 0 && cx <= vpWidth && cy >= 0 && cy <= vpHeight) {
        const stack = document.elementsFromPoint(cx, cy);
        const top = stack[0];
        if (top && top !== el && !el.contains(top) && !top.contains(el)) {
          // Ignore transparent/pointer-events-none overlays that aren't blocking unless they're at stack[0]
          overlaps.push({
            primaryControl: describe(el),
            coveredBy: describe(top),
            controlRect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
          });
        }
      }
    }

    // 8. Use of 100vh in stylesheets / inline styles (note whether 100dvh also exists)
    const uses100vh = [];
    const uses100dvh = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      const scanRules = (ruleList) => {
        for (const rule of ruleList) {
          if (rule instanceof CSSStyleRule) {
            const cssText = rule.style.cssText || rule.cssText;
            if (/100dvh\b/i.test(cssText)) uses100dvh.add(rule.selectorText);
            if (/100vh\b/i.test(cssText)) {
              uses100vh.push({ selector: rule.selectorText, cssText: cssText.slice(0, 120) });
            }
          } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
            scanRules(rule.cssRules);
          }
        }
      };
      scanRules(rules);
    }
    for (const entry of uses100vh) {
      entry.overriddenLaterByDvh = uses100dvh.has(entry.selector);
    }

    // 9. Canvas sizes (both 2D/3D)
    const canvases = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return {
        parentId: c.parentElement?.id || '',
        className: c.className || '',
        visible: isVisible(c),
        cssWidth: Math.round(r.width),
        cssHeight: Math.round(r.height),
        bufferWidth: c.width,
        bufferHeight: c.height,
      };
    });

    return {
      viewportMeta,
      docOverflow,
      bodyOverflow,
      containerOverflows,
      overflowCauses: overflowCauses.slice(0, 25),
      outsideViewport: outsideViewport.slice(0, 30),
      smallTouchTargetsCount: smallTouchTargets.length,
      smallTouchTargets: smallTouchTargets.slice(0, 30),
      smallInputs,
      smallText: smallText.slice(0, 30),
      overlaps,
      uses100vh,
      canvases,
    };
  }, { pageId: pageDef.id, vpWidth: viewport.width, vpHeight: viewport.height });
}

async function runBrowserAudit(browserName, launcher, baseUrl, shareHash, seededHomes) {
  let browser;
  try {
    browser = await launcher.launch({ headless: true });
  } catch (err) {
    console.warn(`[${browserName}] Could not launch: ${err.message}`);
    return { browser: browserName, available: false, error: err.message, results: [] };
  }

  const jobs = [];
  for (const pageDef of PAGES) {
    for (const vp of VIEWPORTS) {
      jobs.push({ pageDef, vp });
    }
  }

  const results = new Array(jobs.length);
  const CONCURRENCY = 2;
  let nextIdx = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= jobs.length) break;
      const { pageDef, vp } = jobs[idx];
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      await context.addInitScript((homesJson) => {
        localStorage.setItem('mopple_homes_v1', homesJson);
      }, seededHomes);

      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));

      const targetUrl = pageDef.id === 'share'
        ? `${baseUrl}${pageDef.path}${shareHash}`
        : `${baseUrl}${pageDef.path}`;

      await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
      await waitForPageReady(page, pageDef);

      const audit = await runDomAudit(page, pageDef, vp);

      // Check 3D canvas size after a rotation (swap width & height)
      let canvasAfterRotation = null;
      if (['editor', 'advanced', 'share'].includes(pageDef.id)) {
        await page.setViewportSize({ width: vp.height, height: vp.width });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(200);
        canvasAfterRotation = await page.evaluate(() => {
          return [...document.querySelectorAll('canvas')].map((c) => {
            const r = c.getBoundingClientRect();
            const st = getComputedStyle(c);
            return {
              parentId: c.parentElement?.id || '',
              className: c.className || '',
              visible: st.display !== 'none' && r.width > 0 && r.height > 0,
              cssWidth: Math.round(r.width),
              cssHeight: Math.round(r.height),
              bufferWidth: c.width,
              bufferHeight: c.height,
              newViewport: `${window.innerWidth}x${window.innerHeight}`,
            };
          });
        });
        // Restore original viewport before taking screenshot!
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(150);
      }

      const shotDir = path.join(OUT_DIR, browserName, pageDef.id);
      await mkdir(shotDir, { recursive: true });
      const shotPath = path.join(shotDir, `${vp.label}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      results[idx] = {
        browser: browserName,
        page: pageDef.label,
        pageId: pageDef.id,
        viewport: vp.label,
        width: vp.width,
        height: vp.height,
        orientation: vp.orientation,
        pageErrors,
        ...audit,
        canvasAfterRotation,
        screenshot: path.relative(process.cwd(), shotPath),
      };

      await context.close();
      completed++;
      if (completed % 7 === 0 || completed === jobs.length) {
        console.log(`[${browserName}] progress: ${completed}/${jobs.length} (${pageDef.label} @ ${vp.label})`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } finally {
    await browser.close();
  }

  return { browser: browserName, available: true, results };
}

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
try {
  await server.listen();
  const port = server.httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const modelJson = await readFile(new URL('../examples/modern-house.mopple', import.meta.url), 'utf8');
  const shareHash = makeCompressedShareHash(modelJson);
  const seededHomes = makeSeededHomes(modelJson);

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Running responsive audit against ${baseUrl} ...`);
  const chromiumReport = await runBrowserAudit('chromium', chromium, baseUrl, shareHash, seededHomes);
  const webkitReport = await runBrowserAudit('webkit', webkit, baseUrl, shareHash, seededHomes);

  const report = {
    generatedAt: new Date().toISOString(),
    viewports: VIEWPORTS,
    browsers: [chromiumReport, webkitReport],
  };

  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  for (const br of report.browsers) {
    if (!br.available) {
      console.log(`[${br.browser}] UNAVAILABLE: ${br.error}`);
      continue;
    }
    const overflowCount = br.results.filter((r) => r.docOverflow.overflowPx > 0).length;
    const overlapCount = br.results.filter((r) => r.overlaps.length > 0).length;
    const smallTouch = br.results.filter((r) => r.smallTouchTargetsCount > 0).length;
    const smallInput = br.results.filter((r) => r.smallInputs.length > 0).length;
    console.log(`[${br.browser}] Audited ${br.results.length} page/viewport combos: overflow=${overflowCount}, overlaps=${overlapCount}, smallTouch=${smallTouch}, smallInputs=${smallInput}`);
  }
  console.log(`Full JSON report written to ${path.relative(process.cwd(), reportPath)}`);
} finally {
  await server.close();
}
