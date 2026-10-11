import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
const server=await createServer({server:{port:5176,host:'127.0.0.1'}});let browser;
try{
 await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/advanced',{waitUntil:'networkidle'});await page.locator('canvas').first().waitFor();
 await page.locator('#project-title').fill('Alpha acceptance home');await page.locator('#project-title').press('Tab');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mopple_homes_v1')??'[]').some(h=>h.name==='Alpha acceptance home'));
 await page.locator('.ai-prompt-input').fill('120 m2 uy yarat 2 yotoqxona 1 hammom');await page.locator('.ai-prompt-input').press('Enter');
 await page.locator('.brief-dialog[open]').waitFor();
 for(const key of ['style','site','household','spaces','materials','budget','lighting','interiorViews'])await page.locator(`#brief-${key}`).fill('No preference');
 await page.locator('#brief-next').click();await page.locator('#brief-confirm').check();await page.locator('#brief-next').click();await page.locator('.brief-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mopple_editor_project')??'null')?.metadata.designBrief);

 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('mopple_homes_v1'))[0].versions.length>0));
 const home=await page.evaluate(()=>JSON.parse(localStorage.getItem('mopple_editor_project')));assert.equal(home.building.rooms.filter(r=>r.type==='bedroom').length,2);
 await page.locator('#btn-delivery').click();
 for(const format of ['png','pdf','3d']){const promise=page.waitForEvent('download');await page.locator('#export-'+format).click();const download=await promise;const bytes=await readFile(await download.path());assert.ok(bytes.length>500);if(format==='pdf')assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');}
 await page.locator('#delivery-dialog [data-close]').click();
 await page.locator('#share-home').click();await page.waitForFunction(async()=> (await navigator.clipboard.readText()).includes('/share.html'));const link=await page.evaluate(()=>navigator.clipboard.readText());
 await page.goto(link,{waitUntil:'networkidle'});assert.equal(await page.locator('#home-name').textContent(),'Alpha acceptance home');await page.locator('canvas').waitFor();assert.equal(await page.locator('#project-title').count(),0);
 for(const perspective of ['cutaway','top','exterior']){await page.locator(`[data-perspective="${perspective}"]`).click();assert.equal(await page.locator(`[data-perspective="${perspective}"]`).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-perspective][aria-pressed="true"]').count(),1);}
 await page.goto(base+'/homes.html',{waitUntil:'networkidle'});assert.equal(await page.locator('.home-row').count(),1);await page.getByRole('button',{name:'Duplicate',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.home-row').length===2);
 await page.locator('.home-row').first().getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.home-row').length===1);
 await mkdir('.impeccable/review',{recursive:true});await page.goto(base+'/advanced',{waitUntil:'networkidle'});await page.screenshot({path:'.impeccable/review/alpha-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.impeccable/review/alpha-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.getByRole('button',{name:'Layers',exact:true}).click();assert.ok(await page.locator('#layers-container').isVisible());
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#hud-solar-toggle').click();assert.ok(await page.locator('#solar-timelapse-btn').isDisabled());await page.keyboard.press('Escape');assert.equal(await page.locator('#hud-solar-toggle').getAttribute('aria-expanded'),'false');
 const nojs=await browser.newContext({javaScriptEnabled:false});const landing=await nojs.newPage();await landing.goto(base);assert.ok(await landing.getByText('For homeowners and renters',{exact:false}).isVisible());assert.ok(await landing.getByRole('link',{name:'Try your own home'}).isVisible());await nojs.close();
 assert.deepEqual(errors,[]);console.log('Alpha acceptance: multilingual generation, library, versions, exports, sharing, mobile and no-JS landing passed.');
}finally{await browser?.close();await server.close();}
