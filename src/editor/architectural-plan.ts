import {architectureMeasurements} from '../project/measurements.ts';
import type {MoppleProjectEngine} from '../project/engine.ts';
import type {SelectedEntity} from './canvas2d.ts';
import {roomPolygon,polygonArea} from '../project/geometry.ts';
import {DEFAULT_FURNITURE_SIZES} from '../project/furniture-dimensions.ts';
const getFurnitureFootprint=(o:ReturnType<MoppleProjectEngine['getSnapshot']>['interior']['objects'][number])=>({width:(o.size?.x??DEFAULT_FURNITURE_SIZES[o.kind].width)*o.scale.x,depth:(o.size?.z??DEFAULT_FURNITURE_SIZES[o.kind].depth)*o.scale.z});

export function createArchitecturalPlan(container:HTMLElement,engine:MoppleProjectEngine,onSelect:(entity:SelectedEntity)=>void){
 const ns='http://www.w3.org/2000/svg';let floorId=engine.getSnapshot().building.floors[0]?.id,selected:string|undefined,dimensions=true,interiorDimensions=false;
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-label','Architectural floor plan with rooms, dimensions, doors and furniture');container.append(svg);
 function draw(){
  const active=document.activeElement;const focused=active&&svg.contains(active)?active.getAttribute('data-entity-id'):null;
  svg.replaceChildren();const p=engine.getSnapshot(),walls=p.building.walls.filter(w=>w.floorId===floorId);if(!walls.length)return;
  const xs=walls.flatMap(w=>[w.start.x,w.end.x]),zs=walls.flatMap(w=>[w.start.z,w.end.z]);const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  svg.setAttribute('viewBox',`${minX-2} ${minZ-2} ${maxX-minX+4} ${maxZ-minZ+4}`);
  function node(tag:string,attrs:Record<string,string|number>,parent:Element=svg){const n=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));parent.append(n);return n;}
  function text(value:string,x:number,y:number,size=.23){const n=node('text',{x,y,'font-size':size,'text-anchor':'middle',fill:'#183d5b'});n.textContent=value;return n;}
  function pick(element:Element,type:SelectedEntity['type'],id:string,label:string){element.setAttribute('data-entity-id',id);element.setAttribute('tabindex','0');element.setAttribute('role','button');element.setAttribute('aria-label',label);element.addEventListener('click',e=>{e.stopPropagation();onSelect({type,id});});element.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(k.key==='Enter'||k.key===' '){k.preventDefault();onSelect({type,id});}});}
  const rooms=p.building.rooms.filter(r=>r.floorId===floorId);
  for(const r of rooms){const pts=roomPolygon(p,r);const shape=node('polygon',{points:pts.map(v=>`${v.x},${v.z}`).join(' '),fill:selected===r.id?'#d1e7f1':r.type==='custom'?'#e4e9dc':'#fbfcf7',stroke:'#93aab3','stroke-width':.02});pick(shape,'room',r.id,`Select ${r.name}`);}
  for(const w of walls){const line=node('line',{x1:w.start.x,y1:w.start.z,x2:w.end.x,y2:w.end.z,stroke:selected===w.id?'#2568e8':'#17394b','stroke-width':w.thickness,'stroke-linecap':'square'});pick(line,'wall',w.id,'Select wall');
   const length=Math.hypot(w.end.x-w.start.x,w.end.z-w.start.z),angle=Math.atan2(w.end.z-w.start.z,w.end.x-w.start.x)*180/Math.PI;
   for(const opening of [...p.building.doors.filter(o=>o.wallId===w.id).map(o=>({...o,door:true})),...p.building.windows.filter(o=>o.wallId===w.id).map(o=>({...o,door:false}))]){
    const group=node('g',{transform:`translate(${w.start.x},${w.start.z}) rotate(${angle})`});const left=opening.position*length-opening.width/2;
    node('rect',{x:left,y:-w.thickness*.6,width:opening.width,height:w.thickness*1.2,fill:'#fbfcf7'},group);
    if(opening.door){node('path',{d:`M${left},0 v${opening.width} M${left},${opening.width} A${opening.width},${opening.width} 0 0 0 ${left+opening.width},0`,fill:'none',stroke:'#52798a','stroke-width':.025},group);}
    else node('line',{x1:left,y1:0,x2:left+opening.width,y2:0,stroke:'#638b9b','stroke-width':.04},group);
   }
  }
  for(const o of p.interior.objects.filter(o=>rooms.some(r=>r.id===o.roomId))){const dim=getFurnitureFootprint(o),g=node('g',{transform:`translate(${o.position.x},${o.position.z}) rotate(${-o.rotation.y*180/Math.PI})`,class:'plan-object'});const color=selected===o.id?'#2568e8':'#567985';
   if(o.assetId.includes('tree')||o.assetId.includes('shrub'))node('circle',{r:Math.max(dim.width,dim.depth)/2,fill:'#ced8bb',stroke:'#75815c','stroke-width':.025},g);
   else{node('rect',{x:-dim.width/2,y:-dim.depth/2,width:dim.width,height:dim.depth,rx:.05,fill:'#edf1ed',stroke:color,'stroke-width':.035},g);if(['bed','sofa'].includes(o.kind))node('path',{d:`M${-dim.width*.4},${-dim.depth*.28} h${dim.width*.8}`,stroke:color,'stroke-width':.03},g);}
   pick(g,'object',o.id,`Select ${o.id.replaceAll('_',' ')}`);
  }
  for(const r of rooms.filter(r=>r.type!=='custom')){const pts=roomPolygon(p,r);const x=(Math.min(...pts.map(v=>v.x))+Math.max(...pts.map(v=>v.x)))/2,z=Math.min(...pts.map(v=>v.z))+(p.building.walls.some(w=>w.id===selected)?1.6:.7);const label=text(`${r.name} · ${polygonArea(pts).toFixed(1)} m²`,x,z,.32);label.setAttribute('pointer-events','none');}
  if(dimensions){
   const rows=architectureMeasurements(p).filter(row=>row.floorId===floorId&&row.entityId===selected&&((row.category==='wall'&&row.id.endsWith('-length'))||(row.category==='opening'&&row.id.endsWith('-width'))));
   for(const row of rows){
    const dx=row.end.x-row.start.x,dz=row.end.z-row.start.z,length=Math.hypot(dx,dz);if(!length)continue;const offset=row.category==='wall'?.85:.25,nx=-dz/length*offset,nz=dx/length*offset;const x=(row.start.x+row.end.x)/2+nx,z=(row.start.z+row.end.z)/2+nz;
    const group=node('g',{'pointer-events':'none',class:'plan-dimension'});node('path',{d:`M${row.start.x+nx},${row.start.z+nz} L${row.end.x+nx},${row.end.z+nz}`,fill:'none',stroke:'#426188','stroke-width':.025},group);
    const label=node('text',{x,y:z-.12,'font-size':.42,'text-anchor':'middle',fill:'#1b1b1b',stroke:'#f5f5f5','stroke-width':.14,'paint-order':'stroke',transform:`rotate(${Math.abs(dz)>Math.abs(dx)?-90:0} ${x} ${z})`},group);label.textContent=`${row.value.toFixed(3)} m`;
   }
  }
  if(interiorDimensions&&selected){const o=p.interior.objects.find(o=>o.id===selected);if(o){const d=getFurnitureFootprint(o);const label=text(`${d.width.toFixed(3)} × ${d.depth.toFixed(3)} m`,o.position.x,o.position.z,.28);label.setAttribute('paint-order','stroke');label.setAttribute('stroke','#fff');label.setAttribute('stroke-width','.1');}}
  node('path',{d:`M${minX},${minZ-.65} V${minZ-1.1} H${maxX} V${minZ-.65} M${maxX+.65},${minZ} H${maxX+1.1} V${maxZ} H${maxX+.65}`,fill:'none',stroke:'#638b9b','stroke-width':.025});text(`${(maxX-minX).toFixed(2)} m`,(minX+maxX)/2,minZ-1.22,.36);const v=text(`${(maxZ-minZ).toFixed(2)} m`,maxX+1.35,(minZ+maxZ)/2,.36);v.setAttribute('transform',`rotate(90 ${maxX+1.35} ${(minZ+maxZ)/2})`);
  text(`${p.building.floors.find(f=>f.id===floorId)?.name??''} · centerlines · meters`,(minX+maxX)/2,maxZ+1.05,.32);
  if(focused)svg.querySelector<SVGElement>(`[data-entity-id="${CSS.escape(focused)}"]`)?.focus();
 }
 const unsubscribe=engine.subscribe(draw);draw();return{setDimensions(value:boolean){dimensions=value;draw();},setInteriorDimensions(value:boolean){interiorDimensions=value;draw();},download(){const previous=dimensions;dimensions=true;draw();const copy=svg.cloneNode(true) as SVGElement;copy.setAttribute('xmlns',ns);copy.setAttribute('width','1600');copy.setAttribute('height','1600');const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));const link=document.createElement('a');link.href=url;link.download=`nopple-measured-plan-${floorId}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dimensions=previous;draw();},setFloor(id:string){floorId=id;draw();},setSelection(entity:SelectedEntity|null){selected=entity?.id;draw();},destroy(){unsubscribe();svg.remove();}};
}
