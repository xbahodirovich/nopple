import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:5191,hmr:false}});
let browser;
try{
 await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 const project=await readFile(new URL('../examples/modern-house.mopple',import.meta.url),'utf8');
 // 1x1 transparent PNG (valid signature, well under 20 KB)
 const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(([model,logo])=>{localStorage.setItem('mopple_editor_project',model);localStorage.setItem('nopple_studio_profile',JSON.stringify({name:'Bog‘cha Studio',logo}));},[project,tinyPng]);
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/advanced',{waitUntil:'networkidle'});
 await page.locator('#share-home').waitFor({timeout:60000});
 await page.click('#share-home');
 let link='';
 for(let attempt=0;attempt<40;attempt++){
  await page.waitForTimeout(250);
  link=await page.evaluate(()=>navigator.clipboard.readText()).catch(()=> '');
  if(link.includes('#gz='))break;
 }
 if(!link.includes('#gz='))throw new Error('share link is not compressed: '+link.slice(0,120));
 if(link.length>150000)throw new Error('compressed link exceeds the 150k cap: '+link.length);
 console.log(`compressed link: ${link.length} chars`);
 // Fresh context: the link must be self-contained.
 const fresh=await browser.newContext({viewport:{width:1280,height:900}});
 const share=await fresh.newPage();
 const shareErrors=[];share.on('pageerror',e=>shareErrors.push(e.message));
 await share.goto(link);
 await share.locator('#home-name').waitFor({timeout:60000});
 const name=await share.locator('#home-name').textContent();
 if(!name||/Unable to open/.test(name))throw new Error('share page failed: '+(name??'empty'));
 const studioName=await share.locator('#studio-name').textContent();
 if(studioName!=='Bog‘cha Studio')throw new Error('studio name missing on share page: '+studioName);
 const logoHidden=await share.locator('#studio-logo').isHidden();
 if(!logoHidden)throw new Error('logo should not travel in compressed links');
 // Old-format link still opens (fresh page: /share fragment navigations do not reload the document).
 const legacy=`${base}/share#home=${encodeURIComponent(Buffer.from(project,'utf8').toString('base64'))}`;
 const legacyPage=await fresh.newPage();
 const legacyErrors=[];legacyPage.on('pageerror',e=>legacyErrors.push(e.message));
 await legacyPage.goto(legacy);
 await legacyPage.locator('#home-name').waitFor({timeout:60000});
 const legacyName=await legacyPage.locator('#home-name').textContent();
 if(!legacyName||/Unable to open/.test(legacyName))throw new Error('legacy link broken: '+(legacyName??'empty'));
 const legacyStudioHidden=await legacyPage.locator('#studio-brand').isHidden();
 if(!legacyStudioHidden)throw new Error('legacy link must not show studio branding');
 if(legacyErrors.length)throw new Error('legacy page errors: '+legacyErrors.join(' | '));
 if(errors.length||shareErrors.length)throw new Error('page errors: '+[...errors,...shareErrors].join(' | '));
 console.log('Share link checks passed: compressed link opens in a fresh context with studio name, logo stays local, legacy links still work.');
 await fresh.close();
}finally{await browser?.close();await server.close();}
