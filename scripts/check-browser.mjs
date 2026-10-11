import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:5182,hmr:false}});let browser;
try{
 await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('.impeccable/review/website',{recursive:true});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.inspiration-frame img').waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});await page.screenshot({path:`.impeccable/review/website/${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.equal(await page.locator('canvas').count(),0);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);const before=await page.locator('.inspiration-frame img').evaluate(el=>el.style.transform);await page.evaluate(()=>scrollTo(0,700));await page.waitForTimeout(100);assert.notEqual(await page.locator('.inspiration-frame img').evaluate(el=>el.style.transform),before);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);assert.equal(await page.locator('.reveal-wait').count(),0);assert.equal(await page.locator('.inspiration-frame img').evaluate(el=>getComputedStyle(el).transform),'none');
 for(const [old,next] of [['/editor.html?view=plan','/editor?view=plan'],['/courtyard.html','/editor'],['/homes.html','/homes'],['/advanced.html','/advanced']]){const response=await page.request.get(base+old,{maxRedirects:0});assert.equal(response.status(),308);assert.equal(response.headers().location,next);}
 await page.goto(base+'/editor?view=plan&select=room:living',{waitUntil:'networkidle'});await page.locator('.selection-editor:not([hidden])').waitFor();assert.equal(await page.locator('.model-workspace').getAttribute('data-view'),'plan');assert.equal(await page.locator('#target-picker').inputValue(),'room:living');await page.locator('#ai-setup').click();assert.ok(await page.locator('#ai-settings').isVisible());await page.locator('#close-ai').click();
 assert.deepEqual(errors,[]);console.log('Website: desktop/mobile, inspiration image, scroll motion, reduced motion, route redirects, selection handoff, AI setup.');
}finally{await browser?.close();await server.close();}
