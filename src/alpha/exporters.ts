import type { MoppleProject } from '../project/schema.ts';
import { roomPolygon, polygonArea } from '../project/geometry.ts';
import { materialsSchedule, type MaterialsSchedule } from '../project/materials.ts';
import { t } from '../i18n/index.ts';
export type ExportFormat = 'png' | 'pdf';
export function download(blob: Blob, name: string) {
 const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Independent from viewport zoom/pan; one labelled sheet per level. */
export function planCanvas(project: MoppleProject, floorId=project.building.floors[0]?.id): HTMLCanvasElement {
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1600,1200);
 ctx.fillStyle='#17231e';ctx.font='30px sans-serif';ctx.fillText(project.project.name,60,55);ctx.font='20px sans-serif';ctx.fillText(`${project.building.floors.find(f=>f.id===floorId)?.name ?? ''} · meters · concept plan`,60,90);
 const walls=project.building.walls.filter(w=>w.floorId===floorId);if(!walls.length)return canvas;
 const points=walls.flatMap(w=>[w.start,w.end]),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
 const minX=Math.min(...xs),minZ=Math.min(...zs),width=Math.max(...xs)-minX,depth=Math.max(...zs)-minZ;
 const scale=Math.min(1400/Math.max(width,1),950/Math.max(depth,1));
 const X=(x:number)=>100+(x-minX)*scale,Z=(z:number)=>170+(z-minZ)*scale;
 for(const room of project.building.rooms.filter(r=>r.floorId===floorId)) {
  const poly=roomPolygon(project,room);ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(X(p.x),Z(p.z)):ctx.moveTo(X(p.x),Z(p.z)));ctx.closePath();
  ctx.fillStyle=project.materials.find(m=>m.id===room.materials?.floor)?.color ?? '#e7eee9';ctx.fill();
 }
 for(const wall of walls){ctx.beginPath();ctx.moveTo(X(wall.start.x),Z(wall.start.z));ctx.lineTo(X(wall.end.x),Z(wall.end.z));ctx.lineWidth=Math.max(2,wall.thickness*scale);ctx.strokeStyle='#273b30';ctx.stroke();}
 for(const opening of [...project.building.doors,...project.building.windows]){
  const wall=walls.find(w=>w.id===opening.wallId);if(!wall)continue;const length=Math.hypot(wall.end.x-wall.start.x,wall.end.z-wall.start.z),half=opening.width/length/2;
  ctx.beginPath();for(const [i,t] of [opening.position-half,opening.position+half].entries()){const x=X(wall.start.x+(wall.end.x-wall.start.x)*t),z=Z(wall.start.z+(wall.end.z-wall.start.z)*t);if(i)ctx.lineTo(x,z);else ctx.moveTo(x,z);}ctx.lineWidth=wall.thickness*scale+2;ctx.strokeStyle=project.building.windows.includes(opening as never)?'#7ab5ce':'#ffffff';ctx.stroke();
 }
 for(const room of project.building.rooms.filter(r=>r.floorId===floorId)){
  const poly=roomPolygon(project,room),rx=poly.map(p=>p.x),rz=poly.map(p=>p.z),x=X((Math.min(...rx)+Math.max(...rx))/2),z=Z((Math.min(...rz)+Math.max(...rz))/2);
  ctx.textAlign='center';ctx.fillStyle='#15231b';ctx.font='bold 18px sans-serif';ctx.fillText(room.name,x,z,Math.max(60,(Math.max(...rx)-Math.min(...rx))*scale-20));ctx.font='16px sans-serif';ctx.fillText(`${(Math.max(...rx)-Math.min(...rx)).toFixed(1)} × ${(Math.max(...rz)-Math.min(...rz)).toFixed(1)} m`,x,z+23);ctx.fillText(`${polygonArea(poly).toFixed(1)} m²`,x,z+44);
 }
 return canvas;
}
/** Minimal dependency-free PDF writer: one JPEG page per canvas at w×h points. */
function pdfFromCanvases(canvases: HTMLCanvasElement[], width: number, height: number): Blob {
 const enc=new TextEncoder(),parts:Uint8Array[]=[],offsets=[0];let size=0;
 const add=(s:string|Uint8Array)=>{const b=typeof s==='string'?enc.encode(s):s;parts.push(b);size+=b.length;};
 const count=canvases.length;
 const object=(id:number,body:string|(()=>void))=>{offsets[id]=size;add(`${id} 0 obj\n`);if(typeof body==='string')add(body);else body();add('\nendobj\n');};
 add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${count} /Kids [${canvases.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 canvases.forEach((canvas,i)=>{
  const id=3+i*3,raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  object(id+1,()=>{add(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream');});
  const stream=`q ${width} 0 0 ${height} 0 0 cm /Im Do Q`;object(id+2,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 });
 const start=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
 return new Blob(parts as BlobPart[],{type:'application/pdf'});
}

/** Raster PDF embeds the labelled canvas, preserving Cyrillic and Uzbek text. */
export function planPdf(project: MoppleProject): Blob {
 return pdfFromCanvases(project.building.floors.map(floor=>planCanvas(project,floor.id)),800,600);
}
export async function exportPlan(project:MoppleProject,format:ExportFormat){
 if(format==='pdf'){download(planPdf(project),'mopple-plan.pdf');return;}
 for(const floor of project.building.floors){const canvas=planCanvas(project,floor.id);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed'))));download(blob,`mopple-plan-${floor.id}.png`);}
}

type MaterialsColumn={label:string;width:number};
type MaterialsRow={cells:string[];swatch?:string};
const materialsSections:(schedule:MaterialsSchedule)=>{title:string;columns:MaterialsColumn[];rows:MaterialsRow[]}[]=(schedule=>[
 {title:t('Rooms'),columns:[{label:t('Name'),width:340},{label:t('Type'),width:260},{label:t('Floor'),width:220},{label:t('Area'),width:170},{label:t('Floor finish'),width:225},{label:t('Wall finish'),width:225}],
  rows:schedule.rooms.map(room=>({cells:[room.name,room.type,room.floor,`${Math.round(room.area*10)/10} m²`,room.floorFinish,room.wallFinish]}))},
 {title:t('Finishes'),columns:[{label:t('Name'),width:620},{label:t('Kind'),width:280},{label:t('Color'),width:340},{label:t('Used in'),width:200}],
  rows:schedule.finishes.map(finish=>({cells:[finish.name,finish.kind,finish.color,String(finish.uses)],swatch:finish.color}))},
 {title:t('Furniture'),columns:[{label:t('Name'),width:520},{label:t('Room'),width:340},{label:t('Qty'),width:160},{label:t('Size (m)'),width:420}],
  rows:schedule.furniture.map(item=>({cells:[item.item,item.room,String(item.qty),item.size]}))},
]);

const MATERIALS_MARGIN=80,MATERIALS_TOP=210,MATERIALS_BOTTOM=2140,MATERIALS_ROW=48,MATERIALS_TITLE=100,MATERIALS_HEAD=76;
type MaterialsOp={kind:'section'|'header'|'row';section:number;row?:number};

/** Paginate the schedule into A4-ratio sheets; a section header never dangles at a page bottom. */
function materialsPages(schedule:MaterialsSchedule):MaterialsOp[][] {
 const sections=materialsSections(schedule),capacity=MATERIALS_BOTTOM-MATERIALS_TOP,pages:MaterialsOp[][]=[];
 let current:MaterialsOp[]=[],used=0;
 const flush=()=>{if(current.length)pages.push(current);current=[];used=0;};
 for(let s=0;s<sections.length;s++){
  if(!sections[s].rows.length)continue;
  if(used+MATERIALS_TITLE+MATERIALS_HEAD>capacity)flush();
  current.push({kind:'section',section:s});used+=MATERIALS_TITLE;
  current.push({kind:'header',section:s});used+=MATERIALS_HEAD;
  for(let r=0;r<sections[s].rows.length;r++){
   if(used+MATERIALS_ROW>capacity){flush();current.push({kind:'header',section:s});used=MATERIALS_HEAD;}
   current.push({kind:'row',section:s,row:r});used+=MATERIALS_ROW;
  }
 }
 flush();
 return pages;
}

/** Labelled sheets; rasterized like the plan PDF so Cyrillic and Uzbek text survive. */
export function materialsCanvas(project:MoppleProject,page=0):HTMLCanvasElement {
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2264;
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 const sections=materialsSections(materialsSchedule(project)),pages=materialsPages(materialsSchedule(project));
 const ops=pages[Math.min(page,pages.length-1)]??[];
 ctx.fillStyle='#17231e';ctx.font='bold 44px sans-serif';ctx.fillText(`${project.project.name} · ${t('Materials list')}`,MATERIALS_MARGIN,110);
 ctx.font='24px sans-serif';ctx.fillStyle='#725f52';ctx.fillText(t('Generated from the current project · not construction documents.'),MATERIALS_MARGIN,150);
 ctx.fillText(`${page+1} / ${pages.length||1}`,1450,110);
 let y=MATERIALS_TOP;
 for(const op of ops){
  const section=sections[op.section];
  if(op.kind==='section'){ctx.fillStyle='#17231e';ctx.font='bold 32px sans-serif';ctx.fillText(section.title,MATERIALS_MARGIN,y+34);}
  else if(op.kind==='header'){y+=MATERIALS_HEAD-24;let x=MATERIALS_MARGIN;ctx.font='bold 25px sans-serif';ctx.fillStyle='#725f52';
   for(const column of section.columns){ctx.fillText(column.label,x,y);x+=column.width;}
   ctx.strokeStyle='#cbbdaa';ctx.beginPath();ctx.moveTo(MATERIALS_MARGIN,y+10);ctx.lineTo(MATERIALS_MARGIN+section.columns.reduce((sum,column)=>sum+column.width,0),y+10);ctx.stroke();}
  else{const row=section.rows[op.row!];let x=MATERIALS_MARGIN;ctx.font='25px sans-serif';ctx.fillStyle='#17231e';
   section.columns.forEach((column,index)=>{const cell=row.cells[index]??'';if(index===0&&row.swatch){ctx.fillStyle=row.swatch;ctx.fillRect(x,y-18,26,26);ctx.fillStyle='#17231e';ctx.fillText(cell,x+38,y);}else ctx.fillText(cell,x,y);x+=column.width;});}
  y+=op.kind==='section'?MATERIALS_TITLE:op.kind==='header'?MATERIALS_HEAD:MATERIALS_ROW;
 }
 return canvas;
}

export function materialsPdf(project:MoppleProject):Blob {
 const pages=materialsPages(materialsSchedule(project)).length||1;
 return pdfFromCanvases(Array.from({length:pages},(_,page)=>materialsCanvas(project,page)),800,1132);
}
