import type { MoppleProject } from '../project/schema.ts';
import { roomPolygon, polygonArea } from '../project/geometry.ts';
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
/** Raster PDF embeds the labelled canvas, preserving Cyrillic and Uzbek text. */
export function planPdf(project: MoppleProject): Blob {
 const enc=new TextEncoder(),parts:Uint8Array[]=[],offsets=[0];let size=0;
 const add=(s:string|Uint8Array)=>{const b=typeof s==='string'?enc.encode(s):s;parts.push(b);size+=b.length;};
 const count=project.building.floors.length;
 const object=(id:number,body:string|(()=>void))=>{offsets[id]=size;add(`${id} 0 obj\n`);if(typeof body==='string')add(body);else body();add('\nendobj\n');};
 add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${count} /Kids [${project.building.floors.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 project.building.floors.forEach((floor,i)=>{
  const id=3+i*3,canvas=planCanvas(project,floor.id),raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  object(id+1,()=>{add(`<< /Type /XObject /Subtype /Image /Width 1600 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream');});
  const stream='q 800 0 0 600 0 0 cm /Im Do Q';object(id+2,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 });
 const start=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
 return new Blob(parts as BlobPart[],{type:'application/pdf'});
}
export async function exportPlan(project:MoppleProject,format:ExportFormat){
 if(format==='pdf'){download(planPdf(project),'mopple-plan.pdf');return;}
 for(const floor of project.building.floors){const canvas=planCanvas(project,floor.id);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed'))));download(blob,`mopple-plan-${floor.id}.png`);}
}
