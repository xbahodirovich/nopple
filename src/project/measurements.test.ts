import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { architectureMeasurements, buildingBounds, exteriorCamera, exteriorViews } from './measurements.ts';
import { parseProject } from './validation.ts';
const fixture = () => parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));

test('measurement schedule covers every wall, room and opening without mutating geometry', () => {
  const project = fixture(), before = JSON.stringify(project), rows = architectureMeasurements(project);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  for (const wall of project.building.walls) {
    assert.equal(rows.find(r => r.id === `${wall.id}-length`)?.value, Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z));
    assert.equal(rows.find(r => r.id === `${wall.id}-thickness`)?.value, wall.thickness);
  }
  for (const opening of [...project.building.doors, ...project.building.windows]) {
    assert.equal(rows.find(r => r.id === `${opening.id}-width`)?.value, opening.width);
    assert.equal(rows.find(r => r.id === `${opening.id}-height`)?.value, opening.height);
  }
  assert.equal(rows.filter(r => r.unit === 'm²').reduce((sum, r) => sum + r.value, 0), 80);
  assert.equal(JSON.stringify(project), before);
});

test('diagonal wall annotations preserve true lengths, floor elevation and opening offsets', () => {
  const project = fixture(); project.building.rooms = []; project.building.windows = [];
  project.building.walls = [{ id: 'diagonal', floorId: project.building.floors[0].id, start: { x: 10, z: 20 }, end: { x: 13, z: 24 }, thickness: .3, height: 2.8 }];
  project.building.floors[0].elevation = 4;
  project.building.doors = [{ id: 'door_diagonal', wallId: 'diagonal', position: .5, width: 1, height: 2 }];
  const rows = architectureMeasurements(project);
  const length = rows.find(r => r.id === 'diagonal-length')!;
  assert.equal(length.value, 5); assert.equal(length.start.y, 4.08);
  const width = rows.find(r => r.id === 'door_diagonal-width')!;
  assert.ok(Math.abs(Math.hypot(width.end.x - width.start.x, width.end.z - width.start.z) - 1) < 1e-10);
  assert.equal(rows.find(r => r.id === 'door_diagonal-offset')?.value, 2);
  assert.equal(rows.find(r => r.id === 'diagonal-end-pier')?.value, 2);
});

test('exterior cameras frame translated tall houses in portrait and landscape', () => {
  const project = fixture();
  for (const wall of project.building.walls) { wall.start.x += 100; wall.end.x += 100; wall.start.z -= 80; wall.end.z -= 80; wall.height = 15; }
  const bounds = buildingBounds(project);
  for (const aspect of [.5, 16 / 9]) for (const view of exteriorViews) {
    const pose = exteriorCamera(project, view, aspect), camera = new THREE.PerspectiveCamera(pose.fov, aspect, .1, 1000);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z); camera.lookAt(pose.target.x, pose.target.y, pose.target.z); camera.updateMatrixWorld();
    if (view === 'street') assert.equal(pose.position.y, bounds.base + 1.6);
    for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.base, bounds.top + .5]) for (const z of [bounds.minZ, bounds.maxZ]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1, `${view} clips model at aspect ${aspect}`);
    }
  }
});

test('furniture dimensions follow physical size, scale and rotation without changing the model',()=>{
 const p=fixture(),object=p.interior.objects[0];object.size={x:2,y:.8,z:1};object.scale={x:1.5,y:2,z:.5};object.rotation.y=Math.PI/3;
 const before=JSON.stringify(p),rows=architectureMeasurements(p).filter(r=>r.entityId===object.id);
 for(const [axis,expected] of [['width',3],['height',1.6],['depth',.5]] as const){const row=rows.find(r=>r.id===`${object.id}-${axis}`)!;assert.equal(row.value,expected);assert.ok(Math.abs(Math.hypot(row.end.x-row.start.x,row.end.y-row.start.y,row.end.z-row.start.z)-expected)<1e-9);}
 assert.equal(JSON.stringify(p),before);
});
