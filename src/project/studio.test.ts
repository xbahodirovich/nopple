import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, MoppleProjectEngine } from './engine.ts';
import { createApprovalToken, verifyApprovalToken, type DesignBrief } from './brief.ts';
import { generateArchitecturalLayout } from './architecture-generator.ts';
import { validateProject } from './validation.ts';
import { roomPolygon, polygonArea } from './geometry.ts';
import { finishVariant } from './finishes.ts';
import { previewLocalEdit, applyDesignPreview } from './preview.ts';
import { archiveFiles } from '../alpha/archive.ts';
import { previewSelectionEdit } from './selection-preview.ts';

const brief: DesignBrief = { request:'A family home with an office', area:240, floors:2, bedrooms:3, bathrooms:2, style:'Warm modern', site:'No preference', household:'No preference', spaces:'Office and courtyard', materials:'Oak', budget:'No preference', lighting:'Natural daylight', interiorViews:'Living room and exterior' };
function home() {
  const engine = new MoppleProjectEngine(createProject());
  engine.applyOperations({operations:[{type:'update_design_brief',brief},{type:'create_house',area:brief.area,floors:brief.floors,bedrooms:brief.bedrooms,bathrooms:brief.bathrooms,style:brief.style,spaces:brief.spaces,household:brief.household}]});
  return engine;
}
test('selection requests preview only the selected object and preserve undo',()=>{
  const engine=home(),before=engine.getSnapshot(),sofa=before.interior.objects.find(item=>item.kind==='sofa')!;
  const preview=previewSelectionEdit(engine,{type:'object',id:sofa.id},'make this sofa blue');
  assert.deepEqual(engine.getSnapshot(),before);
  const changed=preview.project.interior.objects.find(item=>item.id===sofa.id)!;
  assert.notEqual(changed.materialId,sofa.materialId);
  assert.equal(preview.project.materials.find(material=>material.id===changed.materialId)?.color,'#3a5975');
  assert.deepEqual(preview.project.interior.objects.filter(item=>item.id!==sofa.id),before.interior.objects.filter(item=>item.id!==sofa.id));
  applyDesignPreview(engine,preview);engine.undo();assert.deepEqual(engine.getSnapshot(),before);
});
test('wall finish requests isolate shared materials and reject global requests',()=>{
  const engine=home(),before=engine.getSnapshot(),wall=before.building.walls[0];
  const preview=previewSelectionEdit(engine,{type:'wall',id:wall.id},'paint this wall black');
  assert.deepEqual(preview.project.building.walls.filter(item=>item.id!==wall.id),before.building.walls.filter(item=>item.id!==wall.id));
  assert.notEqual(preview.project.building.walls[0].materialId,wall.materialId);
  assert.throws(()=>previewSelectionEdit(engine,{type:'wall',id:wall.id},'remove it'),/wall requests/);
  const chair=before.interior.objects.find(item=>item.kind==='chair')!;
  assert.throws(()=>previewSelectionEdit(engine,{type:'object',id:chair.id},'remove the sofa'),/Select the furniture/);
  assert.throws(()=>previewSelectionEdit(engine,{type:'object',id:chair.id},'make lighting brighter'),/outside your selection/);
});
test('reviewed requirements create actual levels and spaces and stay one undoable transaction', () => {
  const engine = home(), project = engine.getSnapshot();
  assert.equal(project.building.floors.length,2);
  assert.equal(project.building.rooms.filter(room=>room.type==='office').length,1);
  assert.ok(project.building.rooms.some(room=>room.name==='Courtyard garden'));
  assert.equal(project.building.rooms.filter(room=>room.type==='bedroom').length,3);
  assert.equal(project.building.rooms.filter(room=>room.type==='bathroom').length,2);
  assert.ok(Math.abs(project.building.rooms.reduce((area,room)=>area+polygonArea(roomPolygon(project,room)),0)-240)<1e-6);
  engine.undo(); assert.equal(engine.getSnapshot().building.rooms.length,0);
  engine.redo(); assert.equal(engine.getSnapshot().building.floors.length,2);
});
test('one-floor offices and sparse five-floor homes validate with a stair per connection', () => {
  for(const floors of [1,2,3,4,5]) {
    const project=createProject();
    generateArchitecturalLayout(project,{area: floors===1?150:600,floors,bedrooms:1,bathrooms:1,spaces:'Office',style:'Modern'});
    validateProject(project);
    assert.equal(project.interior.objects.filter(object=>object.kind==='stairs').length,floors-1);
    assert.equal(project.building.rooms.filter(room=>room.type==='office').length,1);
  }
});
test('approval fingerprints include request, references and custom constraints', () => {
  const token=createApprovalToken(brief);
  assert.equal(verifyApprovalToken(brief,token),true);
  for(const changed of [{request:'Changed request'},{references:['new.png']},{customConstraints:['Extra requirement']},{spaces:'No office'}]) assert.equal(verifyApprovalToken({...brief,...changed},token),false);
});
test('finish comparisons preserve geometry and source snapshots, and apply with undo', () => {
  const engine=home(), before=engine.getSnapshot();
  const variant=finishVariant(before,'light_stone');
  assert.deepEqual(variant.building.walls.map(({materialId,...wall})=>wall),before.building.walls.map(({materialId,...wall})=>wall));
  assert.deepEqual(variant.interior.objects.map(({materialId,...object})=>object),before.interior.objects.map(({materialId,...object})=>object));
  assert.deepEqual(engine.getSnapshot(),before);
  applyDesignPreview(engine,{project:variant,revision:engine.revision,title:'Light stone',changes:1});
  assert.equal(engine.getSnapshot().building.rooms[0].materials?.floor,'finish_light_stone_floor');
  engine.undo(); assert.deepEqual(engine.getSnapshot(),before);
});
test('local command previews do not contact AI or change the saved engine before approval', () => {
  const engine=home(),before=engine.getSnapshot();
  const preview=previewLocalEdit(engine,'remove the sofa');
  assert.deepEqual(engine.getSnapshot(),before);
  assert.equal(preview.project.interior.objects.filter(o=>o.kind==='sofa').length,0);
  applyDesignPreview(engine,preview);
  assert.equal(engine.getSnapshot().interior.objects.filter(o=>o.kind==='sofa').length,0);
  engine.undo(); assert.deepEqual(engine.getSnapshot(),before);
});
test('changes made after preview reject stale options', () => {
  const engine=home(),preview=previewLocalEdit(engine,'remove the sofa');
  engine.renameProject('Newer work');
  assert.throws(()=>applyDesignPreview(engine,preview),/changed after this preview/);
  assert.equal(engine.getSnapshot().project.name,'Newer work');
});
test('home archive has valid stored ZIP records, CRC and UTF-8 paths', async () => {
  const archive=await archiveFiles([{name:'home.mopple',data:'123456789'},{name:'views/спальня.txt',data:'room'}]);
  const bytes=new Uint8Array(await archive.arrayBuffer()),view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint32(14,true),0xcbf43926);
  assert.equal(view.getUint16(6,true),0x0800);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(view.getUint16(bytes.length-14,true),2);
});
