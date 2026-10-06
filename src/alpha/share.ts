import '../editor/editor.css';
import {loadShared} from './projects.ts';
import {MoppleProjectEngine} from '../project/engine.ts';
import {Canvas3D} from '../editor/canvas3d.ts';
import {planCanvas} from './exporters.ts';
const viewport=document.querySelector<HTMLElement>('#shared-view')!;
void loadShared().then(model=>{
 document.querySelector('#home-name')!.textContent=model.project.name;
 try {const view=new Canvas3D(viewport,{engine:new MoppleProjectEngine(model),readOnly:true});window.addEventListener('pagehide',()=>view.destroy(),{once:true});}
 catch {viewport.append(planCanvas(model));}
}).catch(e=>{viewport.textContent=`Unable to open this home: ${e instanceof Error?e.message:'Invalid link'}`;});
