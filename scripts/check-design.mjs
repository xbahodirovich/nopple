import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const server=await createServer({server:{port:5177,host:'127.0.0.1'}});let browser;
const tag=process.argv[2] ?? 'before';
try{
 await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true});const findings=[];const out='.impeccable/review/design';await mkdir(out,{recursive:true});
 const model=JSON.parse(await readFile('examples/modern-house.mopple','utf8'));
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['landing','editor','brief','gallery','solar','homes','homes-populated','share']){
   if(route==='landing')await page.goto(base,{waitUntil:'networkidle'});
   if(route==='editor')await page.goto(base+'/editor.html',{waitUntil:'networkidle'});
   if(route==='brief'){await page.locator('#btn-house-brief').click();}
   if(route==='gallery'){await page.locator('#brief-close').click();await page.locator('#btn-open-gallery').click();}
   if(route==='solar'){await page.keyboard.press('Escape');await page.locator('#hud-solar-toggle').click();}
   if(route==='homes')await page.goto(base+'/homes.html',{waitUntil:'networkidle'});
   if(route==='homes-populated'){
    const homes=Array.from({length:6},(_,i)=>{const copy=structuredClone(model);copy.project.id=`project_audit_${i}`;copy.project.name=i===0?'A long home name for a shared family apartment and renovation':`Home study ${i+1}`;return{id:copy.project.id,name:copy.project.name,model:copy,versions:[copy]};});
    await page.evaluate(homes=>localStorage.setItem('mopple_homes_v1',JSON.stringify(homes)),homes);await page.reload({waitUntil:'networkidle'});
   }
   if(route==='share')await page.goto(base+'/share.html#home='+encodeURIComponent(Buffer.from(JSON.stringify(model)).toString('base64')),{waitUntil:'networkidle'});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:`${out}/${tag}-${route}-${device}.png`,fullPage:route==='landing'||route.startsWith('homes')});
   findings.push({route,device,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,unlabelled:[...document.querySelectorAll('button,input:not([type=hidden]),select')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&!el.getAttribute('aria-label')&&!el.getAttribute('title')&&!el.textContent.trim()&&!el.labels?.length}).map(el=>el.id||el.className),smallTargets:[...document.querySelectorAll('button,a,input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.height<40||r.width<40)&&getComputedStyle(el).visibility==='visible'}).map(el=>(el.id||el.textContent.trim()).slice(0,70))})),errors:[...errors]});
  }
  await context.close();
 }
 await writeFile(`${out}/${tag}-metrics.json`,JSON.stringify(findings,null,2));console.log(JSON.stringify(findings.map(f=>({route:f.route,device:f.device,overflow:f.overflow,unlabelled:f.unlabelled,smallTargets:f.smallTargets.length,errors:f.errors})),null,2));
}finally{await browser?.close();await server.close();}
