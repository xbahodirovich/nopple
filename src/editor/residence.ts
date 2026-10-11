import {createMeasurementPanel} from './measurement-panel.ts';
import {initLanguage,normalizeLocalPrompt} from '../i18n/index.ts';
import '@fontsource-variable/inter';
import './residence.css';
import './courtyard-theme.css';
import {createArchitecturalPlan} from './architectural-plan.ts';
import {createSelectionEditor} from './selection-editor.ts';
import {escapeHtml} from './ui.ts';
import {createCourtyardResidence} from '../project/courtyard.ts';
import {MoppleProjectEngine} from '../project/engine.ts';
import {Canvas3D} from './canvas3d.ts';
import type {SelectedEntity} from './canvas2d.ts';
import {finishOptions,finishVariant} from '../project/finishes.ts';
import {previewSelectionEdit} from '../project/selection-preview.ts';
import {applyDesignPreview,type DesignPreview} from '../project/preview.ts';
import {polygonArea,roomPolygon} from '../project/geometry.ts';
import {shareHome,localHomes,saveHome} from '../alpha/projects.ts';
import {planCanvas} from '../alpha/exporters.ts';

const homeId=new URLSearchParams(location.search).get('home');
const key=homeId?'mopple_draft_'+homeId:'mopple_courtyard_studio_v1';
let initial=(homeId?localHomes().find(h=>h.id===homeId)?.model:undefined)??createCourtyardResidence();
try {const saved=localStorage.getItem(key);if(saved)initial=new MoppleProjectEngine(JSON.parse(saved)).getSnapshot();}catch { /* A broken local draft must not prevent opening the studio. */ }
const engine=new MoppleProjectEngine(initial);
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const icon=(path:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const arrow=icon('m9 5 7 7-7 7');
$('#residence').innerHTML=`
<header class="page-heading"><a href="/">Nopple</a><span>/</span><span>Editor</span><small>Your design desk</small></header>
<section class="design-stage" aria-labelledby="design-title">
<header class="stage-header"><h1 id="design-title">A home, in the making.</h1><a class="wordmark" href="/homes">nopple</a><span class="home-name">${escapeHtml(initial.project.name)}</span><span id="save-status" role="status">Saved locally</span><button id="ai-setup">AI setup</button><button data-action="share">Share</button><button class="primary" data-action="project">Export</button></header>
<div class="design-workspace">
<aside class="brief"><h2>Your brief</h2><dl id="brief-facts"></dl><div class="brief-divider"></div><p class="selection-hint">Select a room or object to shape the details.</p><label class="target-label" for="target-picker">Select a room or item</label><select id="target-picker" aria-label="Select a room or item"></select><div id="selected-title">Living room</div><form id="edit-form"><label for="request">What would you like to change?</label><textarea id="request" rows="3" placeholder="Make the sofa olive green"></textarea><button class="primary" type="submit">Preview change ${arrow}</button></form><p class="local-note">Local edits · AI not connected</p><p id="edit-status" role="status"></p><button id="undo" disabled>${icon('M9 5 4 10l5 5 M4 10h9a6 6 0 0 1 0 12')} Undo change</button><a class="advanced-link" href="${homeId?`/advanced?home=${encodeURIComponent(homeId)}`:'/advanced?source=courtyard'}">Open full editor ${arrow}</a></aside>
<div class="model-workspace" data-view="split"><nav class="view-tabs" aria-label="Design view"><button data-view="plan" aria-pressed="false">Plan</button><button data-view="split" aria-pressed="true">Split</button><button data-view="model" aria-pressed="false">3D</button></nav><div class="level-tabs" role="group" aria-label="Visible level"><button data-floor="" aria-pressed="true">All levels</button>${initial.building.floors.map(f=>`<button data-floor="${escapeHtml(f.id)}" aria-pressed="false">${escapeHtml(f.name)}</button>`).join('')}</div><div id="plan-view" aria-label="Floor plan"><div class="plan-style-tabs" aria-label="Plan style"><button data-plan-style="architectural" aria-pressed="true">Architectural</button><button data-plan-style="furnished" aria-pressed="false">Furnished</button></div><div id="architecture-plan"></div><div id="furnished-plan" hidden></div></div><div id="model-view" aria-label="Interactive courtyard house"></div><div class="model-caption"><span>The residence</span><span>Drag to orbit · Scroll to zoom</span><button id="reset-camera" aria-label="Reset camera">${icon('M4 10a8 8 0 1 1 1 9 M4 4v6h6')}</button></div></div>
<aside class="properties"><h2>Properties</h2><div class="property-tabs"><button data-property="room" aria-pressed="true">Room</button><button data-property="material" aria-pressed="false">Material</button><button data-property="view" aria-pressed="false">View</button></div><img id="room-thumbnail" alt="Current living room rendering"><h3 id="property-name">Living room</h3><div id="property-content"></div></aside>
</div></section>
<div class="lower-grid"><section class="comparison" aria-labelledby="compare-title"><header><h2 id="compare-title">Find your finish.</h2><label class="sun-control">${icon('M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M5 5 3 3 M21 21l-2-2 M5 19l-2 2 M21 3l-2 2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0')} <span>Sunlight</span><input id="sunlight" type="range" min="10" max="75" value="48" aria-label="Sun elevation"></label></header><div class="options">${finishOptions.map((f,i)=>`<button class="finish" data-finish="${f.id}" aria-pressed="${i===0}"><span class="render-placeholder"><img id="finish-${f.id}" alt="${f.name} living room"><span>Rendering room…</span></span><span class="finish-label"><i style="background:${f.color}"></i>${f.name}<span class="radio"></span></span></button>`).join('')}</div></section>
<section class="delivery" aria-labelledby="delivery-title"><header><h2 id="delivery-title">Ready for the next chapter.</h2><small>Concept design</small></header><div class="delivery-body"><div class="exterior-image"><img id="exterior" alt="The residence exterior"><span>Rendering exterior…</span></div><div class="delivery-links"><button data-action="plan">${icon('M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6')}Floor plans ${arrow}</button><button data-action="room">${icon('M3 3h18v18H3z M3 16l6-6 5 5 3-3 4 4')}Room view ${arrow}</button><button data-action="project">${icon('M3 5h7l2 3h9v13H3z')}Project file ${arrow}</button><button class="primary" data-action="share">${icon('M12 16V3m-4 4 4-4 4 4 M5 11v10h14V11')}Share home</button></div></div></section></div><p class="page-footnote">An editable concept home. Views are rendered from this project. <span id="render-status" role="status"></span></p>
<dialog id="review"><header><h2>Review your change</h2><button id="close-review" aria-label="Close preview">×</button></header><img id="review-image" alt="Proposed design change"><p id="review-description"></p><footer><button id="discard">Keep current</button><button class="primary" id="apply">Apply change</button></footer></dialog>
<dialog id="share-dialog"><header><h2>Share your home</h2><button id="close-share" aria-label="Close sharing">×</button></header><p>Anyone with this link can view this snapshot. The link cannot be revoked.</p><label for="share-address">Share address</label><input id="share-address" readonly><button id="copy-link" class="primary">Copy link</button><p id="share-status" role="status"></p></dialog>`;

let selection:SelectedEntity={type:'room',id:initial.building.rooms.find(r=>r.type==='living_room')?.id??initial.building.rooms[0].id},pending:DesignPreview|undefined,propertyTab='room';
let thumbnailRoom='living';
const select=(entity:SelectedEntity|null)=>{if(!entity)return;selection=entity;model.setSelection(entity);plan.setSelection(entity);architecturePlan.setSelection(entity);selectionEditor.setSelection(entity);updateProperties();const room=selectedRoom();if(thumbnailRoom!==room.id){thumbnailRoom=room.id;const img=$<HTMLImageElement>('#room-thumbnail');img.removeAttribute('src');img.alt=`${room.name} room view`;requestAnimationFrame(()=>{try{img.src=model.captureRoomView(selectedRoom().id,320,210);}catch(error){showError(error);}});}};
const model=new Canvas3D($('#model-view'),{engine,onSelect:select,onError:showError});
const plan=new Canvas3D($('#furnished-plan'),{engine,onSelect:select,onError:showError});
const architecturePlan=createArchitecturalPlan($('#architecture-plan'),engine,select);
const selectionEditor=createSelectionEditor($('.model-workspace'),engine,showPreview);
const measurements=createMeasurementPanel($('.design-stage'),engine,select,enabled=>{model.setDimensionsVisible(enabled);plan.setDimensionsVisible(enabled);architecturePlan.setInteriorDimensions(enabled);},enabled=>architecturePlan.setDimensions(enabled),()=>architecturePlan.download());
function showPreview(preview:DesignPreview){pending=preview;$<HTMLImageElement>('#review-image').src=model.captureAlternative(preview.project,preview.focusRoomId,960,600);$('#review-description').textContent=preview.title;$<HTMLDialogElement>('#review').showModal();}
if(matchMedia('(max-width:600px)').matches){$('.model-workspace').dataset.view='model';document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.view==='model')));}
model.setViewPreset('cutaway');plan.setFloor(initial.building.floors[0].id);plan.setViewPreset('top');
function showError(error:unknown){$('#edit-status').textContent=error instanceof Error?error.message:String(error);}
function selectedRoom(){const p=engine.getSnapshot();const o=p.interior.objects.find(o=>o.id===selection.id);return p.building.rooms.find(r=>r.id===(o?.roomId??selection.id))??p.building.rooms.find(r=>r.boundary.some(e=>e.wallId===selection.id))??p.building.rooms[0];}
function updateProperties(){
 const p=engine.getSnapshot(),r=selectedRoom(),object=p.interior.objects.find(o=>o.id===selection.id);
 const label=object?object.id.replaceAll('_',' '):selection.type==='wall'?'Selected wall':r.name;
 const picker=$<HTMLSelectElement>('#target-picker');picker.replaceChildren();for(const r of p.building.rooms){const group=document.createElement('optgroup');group.label=r.name;group.append(new Option(r.name,`room:${r.id}`));for(const o of p.interior.objects.filter(o=>o.roomId===r.id&&!o.assetId.includes('shrub')))group.append(new Option(o.id.replaceAll('_',' '),`object:${o.id}`));picker.append(group);}picker.value=`${selection.type}:${selection.id}`;
 $('#selected-title').textContent=label;$('#property-name').textContent=label;
 const area=p.building.rooms.filter(r=>r.type!=='custom').reduce((sum,r)=>sum+polygonArea(roomPolygon(p,r)),0);
 $('#brief-facts').innerHTML=`<div><dt>Floor area</dt><dd>${Math.round(area)} m²</dd></div><div><dt>Levels</dt><dd>${p.building.floors.length} floors</dd></div><div><dt>Bedrooms</dt><dd>${p.building.rooms.filter(r=>r.type==='bedroom').length} bedrooms</dd></div><div><dt>Bathrooms</dt><dd>${p.building.rooms.filter(r=>r.type==='bathroom').length} bathrooms</dd></div>`;
 const content=$('#property-content');content.replaceChildren();
 if(propertyTab==='view'){
  for(const [name,preset] of [['Cutaway','cutaway'],['Exterior','street'],['Overhead','top']] as const){const button=document.createElement('button');button.textContent=name;button.onclick=()=>model.setViewPreset(preset);content.append(button);}
 }else{
  const metric=document.createElement('div');metric.className='property-row';metric.textContent=object?`Size · ${object.size?.x.toFixed(2)} × ${object.size?.z.toFixed(2)} m`:`Room area · ${polygonArea(roomPolygon(p,r)).toFixed(1)} m²`;content.append(metric);
  for(const [title,id] of [['Floor finish',r.materials?.floor],['Wall finish',r.materials?.wall],['Ceiling',r.materials?.ceiling]]){
   const mat=p.materials.find(m=>m.id===id),row=document.createElement('div');row.className='property-row';const caption=document.createElement('span');caption.textContent=title??'';row.append(caption);const value=document.createElement('strong'),swatch=document.createElement('i');swatch.style.background=mat?.color??'#ddd';value.append(swatch,document.createTextNode(mat?.name??'Default'));row.append(value);content.append(row);
  }
  if(propertyTab==='material'){const help=document.createElement('p');help.textContent='Choose a finish below, or describe a finish for the selected room or object.';content.append(help);}
 }
 $('#undo').toggleAttribute('disabled',!engine.canUndo);
}
updateProperties();
let renderSerial=0;
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function renderCards(){
 const serial=++renderSerial,p=engine.getSnapshot();$('#render-status').textContent='Updating views…';
 try{
  for(const finish of finishOptions){await frame();if(serial!==renderSerial)return;const img=$<HTMLImageElement>(`#finish-${finish.id}`);img.src=model.captureAlternative(finishVariant(p,finish.id,selectedRoom().id),selectedRoom().id,720,470);img.onload=()=>img.parentElement!.classList.add('loaded');}
  await frame();if(serial!==renderSerial)return;
  thumbnailRoom=selectedRoom().id;$<HTMLImageElement>('#room-thumbnail').src=model.captureRoomView(thumbnailRoom,320,210);
  const img=$<HTMLImageElement>('#exterior');img.src=model.captureExteriorView('street',960,620);img.onload=()=>img.parentElement!.classList.add('loaded');$('#render-status').textContent='';
 }catch(error){$('#render-status').textContent='Some views could not render. Reload to retry.';showError(error);}
}
engine.subscribe(()=>{try{localStorage.setItem(key,JSON.stringify(engine.getSnapshot()));void saveHome(engine.getSnapshot()).catch(()=>{});$('#save-status').textContent='Saved locally';}catch{$('#save-status').textContent='Storage full · Export to save';}updateProperties();void renderCards();});
$('.advanced-link').onclick=()=>{try{localStorage.setItem(key,JSON.stringify(engine.getSnapshot()));}catch{showError('Export the project to open it in the full editor.');return false;}};
$('#undo').onclick=()=>engine.undo();
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>{if(!button.matches('button'))return;$('.model-workspace').dataset.view=button.dataset.view;document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));window.dispatchEvent(new Event('resize'));});
document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button=>button.onclick=()=>{model.setFloor(button.dataset.floor||null);plan.setFloor(button.dataset.floor||engine.getSnapshot().building.floors[0].id);architecturePlan.setFloor(button.dataset.floor||engine.getSnapshot().building.floors[0].id);model.setViewPreset('cutaway');plan.setViewPreset('top');document.querySelectorAll('[data-floor]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
document.querySelectorAll<HTMLButtonElement>('[data-property]').forEach(button=>button.onclick=()=>{propertyTab=button.dataset.property!;document.querySelectorAll('[data-property]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updateProperties();});
$('#reset-camera').onclick=()=>model.setViewPreset('cutaway');
$('#edit-form').onsubmit=event=>{event.preventDefault();try{const request=$<HTMLTextAreaElement>('#request').value;const preview=previewSelectionEdit(engine,selection,normalizeLocalPrompt(request));preview.title=request;showPreview(preview);$('#edit-status').textContent='';}catch(error){showError(error);}};
for(const id of ['close-review','discard'])$(`#${id}`).onclick=()=>{pending=undefined;$<HTMLDialogElement>('#review').close();};
$('#apply').onclick=()=>{try{if(pending)applyDesignPreview(engine,pending);pending=undefined;$<HTMLDialogElement>('#review').close();$('#edit-status').textContent='Change applied. You can undo it.';}catch(error){showError(error);}};
document.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach(button=>button.onclick=()=>{const id=button.dataset.finish as typeof finishOptions[number]['id'];engine.importProject(JSON.stringify(finishVariant(engine.getSnapshot(),id)));document.querySelectorAll('[data-finish]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
$('#sunlight').oninput=()=>{const sun={mode:'manual' as const,azimuth:225,elevation:Number($<HTMLInputElement>('#sunlight').value),intensity:3.1,warmth:.25};model.previewSun(sun);plan.previewSun(sun);};
$('#sunlight').onchange=()=>engine.applyOperations({operations:[{type:'update_sun',sun:{mode:'manual',azimuth:225,elevation:Number($<HTMLInputElement>('#sunlight').value),intensity:3.1,warmth:.25}}]});
function download(href:string,name:string){const a=document.createElement('a');a.href=href;a.download=name;a.click();}
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=async()=>{try{const p=engine.getSnapshot();switch(button.dataset.action){case 'project':{const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));download(url,'courtyard-home.mopple');setTimeout(()=>URL.revokeObjectURL(url),1000);break;}case 'plan':for(const floor of p.building.floors)download(planCanvas(p,floor.id).toDataURL('image/png'),`${floor.name}.png`);break;case 'room':download(model.captureRoomView(selectedRoom().id,1920,1200),'room-view.png');break;case 'share':$<HTMLDialogElement>('#share-dialog').showModal();$<HTMLInputElement>('#share-address').value=await shareHome(p);break;}}catch(error){showError(error);}});
$('#close-share').onclick=()=>$<HTMLDialogElement>('#share-dialog').close();$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($<HTMLInputElement>('#share-address').value);$('#share-status').textContent='Link copied.';}catch{$('#share-status').textContent='Select the address and copy it manually.';}};
matchMedia('(max-width:600px)').addEventListener('change',event=>{if(event.matches&&$('.model-workspace').dataset.view==='split'){$('.model-workspace').dataset.view='model';document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.view==='model')));}});
window.addEventListener('pagehide',()=>{renderSerial++;model.destroy();plan.destroy();architecturePlan.destroy();selectionEditor.destroy();measurements.destroy();},{once:true});
void renderCards();

$('#target-picker').onchange=()=>{const [type,id]=$<HTMLSelectElement>('#target-picker').value.split(':');select({type:type as SelectedEntity['type'],id});};
document.querySelectorAll<HTMLButtonElement>('[data-plan-style]').forEach(button=>button.onclick=()=>{const furnished=button.dataset.planStyle==='furnished';$('#architecture-plan').hidden=furnished;$('#furnished-plan').hidden=!furnished;document.querySelectorAll('[data-plan-style]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(furnished)requestAnimationFrame(()=>plan.setViewPreset('top'));});
const settings=document.createElement('dialog');settings.id='ai-settings';settings.innerHTML=`<header><h2>Connect AI when you’re ready.</h2><button type="button" id="close-ai">Close</button></header><p>Nopple currently uses local editing. The existing AI service supports NVIDIA API keys.</p><h3>Local development</h3><p>Create <code>.env.local</code> in the project root and add your key:</p><pre>NVIDIA_API_KEY=your_nvidia_key</pre><p>Restart the development server after changing environment variables.</p><h3>Hosted website</h3><p>Add <code>NVIDIA_API_KEY</code> in your hosting provider’s environment variables, then redeploy. Keep this server-side; do not use a VITE_ prefix for the secret.</p><p>Adding the key configures the service. Editor remains in local mode until its AI editing integration is enabled. A key does not generate photorealistic 3D assets.</p>`;document.body.append(settings);$('#ai-setup').onclick=()=>settings.showModal();$('#close-ai').onclick=()=>settings.close();

// Carry the landing-page exploration into the editable project.
const entry=new URLSearchParams(location.search),entryView=entry.get('view');
if(entryView&&['plan','split','model'].includes(entryView))document.querySelector<HTMLButtonElement>(`button[data-view="${entryView}"]`)?.click();
const entrySelection=entry.get('select');
if(entrySelection){const [type,id]=entrySelection.split(':');const project=engine.getSnapshot();if((type==='room'&&project.building.rooms.some(r=>r.id===id))||(type==='object'&&project.interior.objects.some(o=>o.id===id))||(type==='wall'&&project.building.walls.some(w=>w.id===id)))select({type:type as SelectedEntity['type'],id});}

initLanguage();
