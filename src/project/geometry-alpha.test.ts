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
