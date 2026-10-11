import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCourtyardResidence} from './courtyard.ts';
import {polygonArea,roomPolygon} from './geometry.ts';
import {MoppleProjectEngine} from './engine.ts';
import {validateProject} from './validation.ts';

test('courtyard reference has 180 square meters indoors and valid editable levels',()=>{
 const p=createCourtyardResidence();
 const area=p.building.rooms.filter(r=>r.type!=='custom').reduce((a,r)=>a+polygonArea(roomPolygon(p,r)),0);
 assert.ok(Math.abs(area-180)<.00001);
 assert.equal(p.building.floors.length,2);
 assert.equal(p.building.rooms.filter(r=>r.type==='bedroom').length,3);
 assert.equal(p.building.rooms.filter(r=>r.type==='bathroom').length,2);
 assert.equal(p.interior.objects.filter(o=>o.kind==='bed').length,3);
 assert.ok(p.lighting.some(l=>l.type==='directional'));
 const engine=new MoppleProjectEngine(p),sofa=p.interior.objects.find(o=>o.id==='main_sofa')!;
 engine.applyOperations({operations:[{type:'move_object',targetId:sofa.id,position:{...sofa.position,x:sofa.position.x+.1}}]});
 validateProject(engine.getSnapshot());assert.equal(engine.undo(),true);
 assert.deepEqual(engine.getSnapshot(),p);
});
