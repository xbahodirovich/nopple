import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polygonsOverlap } from './geometry.ts';
const rect = (x: number,z: number,w=2,d=2) => [{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
test('overlap detects containment, crossings and duplicates but allows shared walls', () => {
 assert.equal(polygonsOverlap(rect(0,0),rect(2,0)),false);
 assert.equal(polygonsOverlap(rect(0,0),rect(1,1)),true);
 assert.equal(polygonsOverlap(rect(0,0,5,5),rect(1,1)),true);
 assert.equal(polygonsOverlap(rect(0,0),rect(0,0)),true);
});
import {readFileSync} from 'node:fs';
import {validateProject} from './validation.ts';
const model=()=>JSON.parse(readFileSync(new URL('../../examples/modern-house.mopple',import.meta.url),'utf8'));
test('validator rejects undersized rooms and duplicate room footprints',()=>{
 const tiny=model();tiny.building.doors=[];tiny.building.windows=[];for(const wall of tiny.building.walls){wall.start.x*=.01;wall.start.z*=.01;wall.end.x*=.01;wall.end.z*=.01;}assert.throws(()=>validateProject(tiny),/minimum concept area/);
 const overlap=model();overlap.building.rooms.push({...overlap.building.rooms[0],id:'overlapping_room'});assert.throws(()=>validateProject(overlap),/overlaps/);
});
