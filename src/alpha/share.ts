import {initLanguage} from '../i18n/index.ts';
import '@fontsource-variable/inter';
import '../editor/editor.css';
import './surfaces.css';
import {loadShared} from './projects.ts';
import {MoppleProjectEngine} from '../project/engine.ts';
import {Canvas3D} from '../editor/canvas3d.ts';
import {planCanvas} from './exporters.ts';
const viewport=document.querySelector<HTMLElement>('#shared-view')!;
void loadShared().then(({model,studio})=>{
 viewport.replaceChildren();
 document.querySelector('#home-name')!.textContent=model.project.name;
 if(studio){
  const brand=document.querySelector<HTMLElement>('#studio-brand')!;
  const name=brand.querySelector<HTMLElement>('#studio-name')!,logo=brand.querySelector<HTMLImageElement>('#studio-logo')!;
  name.textContent=studio.name; // plain text only, never injected as markup
  if(studio.logo){logo.src=studio.logo;logo.hidden=false;}
  brand.hidden=false;
 }
 try {const view=new Canvas3D(viewport,{engine:new MoppleProjectEngine(model),readOnly:true});
 document.querySelectorAll<HTMLButtonElement>('[data-perspective]').forEach(button=>button.addEventListener('click',()=>{const perspective=button.dataset.perspective as 'exterior'|'cutaway'|'top';view.setViewPreset(perspective==='exterior'?'isometric':perspective);document.querySelectorAll('[data-perspective]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));window.addEventListener('pagehide',()=>view.destroy(),{once:true});}
 catch {viewport.replaceChildren(planCanvas(model));document.querySelector('.share-controls')?.setAttribute('hidden','');}
}).catch(e=>{viewport.textContent=`Unable to open this home: ${e instanceof Error?e.message:'Invalid link'}`;});

initLanguage();

import "../reference-theme.css";
