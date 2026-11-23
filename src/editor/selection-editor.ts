import {normalizeLocalPrompt} from '../i18n/index.ts';
import type { MoppleProjectEngine } from '../project/engine.ts';
import type { SelectedEntity } from './canvas2d.ts';
import { previewSelectionEdit } from '../project/selection-preview.ts';
import { previewEditWithAi } from '../project/preview.ts';
import { aiFallbackClientEnabled } from './ai.ts';
import { aiStateMessage, aiThinkingLabel, aiCancelLabel } from './ai-status.ts';
import type { DesignPreview } from '../project/preview.ts';

export function createSelectionEditor(container:HTMLElement,engine:MoppleProjectEngine,onPreview:(preview:DesignPreview)=>void) {
  const form=document.createElement('form');form.className='selection-editor';form.hidden=true;
  form.setAttribute('aria-label','Change selected room or item');
  form.innerHTML=`<header><div><span id="selection-kind"></span><strong id="selection-name"></strong></div><button class="btn btn-secondary btn-sm" type="button" id="selection-close" aria-label="Dismiss selection prompt">Close</button></header><label for="selection-request">What would you like to change?</label><div class="selection-input"><textarea id="selection-request" rows="2" placeholder="Describe a change to this selection…"></textarea><button class="btn btn-primary" type="submit">Preview change</button></div><p id="selection-error" role="alert"></p>`;
  container.append(form);
  const input=form.querySelector<HTMLTextAreaElement>('textarea')!;
  const error=form.querySelector('#selection-error')!;
  let selected:SelectedEntity|null=null;
  function setSelection(selection:SelectedEntity|null) {
    const different=selected?.id!==selection?.id;selected=selection;
    form.hidden=!selection;if(!selection)return;
    const project=engine.getSnapshot();
    const entity=selection.type==='room'?project.building.rooms.find(item=>item.id===selection.id):selection.type==='object'?project.interior.objects.find(item=>item.id===selection.id):project.building.walls.find(item=>item.id===selection.id);
    if(!entity){form.hidden=true;return;}
    form.querySelector('#selection-kind')!.textContent=selection.type==='object'?'Selected item':`Selected ${selection.type}`;
    form.querySelector('#selection-name')!.textContent='name' in entity?String(entity.name):'kind' in entity?entity.kind.replaceAll('_',' '):'Wall';
    input.placeholder=selection.type==='object'?'Try: make it blue, rotate 45 degrees, move 0.2m left':selection.type==='wall'?'Try: paint this wall white or use dark oak':'Try: add a chair here or change this floor to oak';
    if(different){input.value='';error.textContent='';}
  }
  form.querySelector('#selection-close')!.addEventListener('click',()=>{form.hidden=true;});
  const submitButton=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  let thinking=false,abort:null|(()=>void)=null;
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!selected)return;
    if(thinking&&abort){abort();return;}
    error.textContent='';
    const request=normalizeLocalPrompt(input.value);
    if(!aiFallbackClientEnabled()){
      try{const preview=previewSelectionEdit(engine,selected,request);preview.title=input.value;onPreview(preview);form.hidden=true;}
      catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);input.focus();}
      return;
    }
    // Hosted fallback: local first, then the AI service; the preview is never applied directly.
    const controller=new AbortController();abort=()=>controller.abort();thinking=true;
    const restoreLabel=submitButton.textContent??'';
    submitButton.textContent=aiCancelLabel();
    error.textContent=aiThinkingLabel();
    void (async()=>{
      try{
        const preview=await previewEditWithAi(engine,request,selected!,{signal:controller.signal});
        preview.title=input.value;onPreview(preview);form.hidden=true;
      }catch(reason){error.textContent=aiStateMessage(reason);input.focus();}
      finally{thinking=false;abort=null;submitButton.textContent=restoreLabel;if(error.textContent===aiThinkingLabel())error.textContent='';}
    })();
  });
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();form.hidden=true;}else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
  const unsubscribe=engine.subscribe(()=>{if(selected)setSelection(selected);});
  return {setSelection,destroy(){unsubscribe();form.remove();}};
}
