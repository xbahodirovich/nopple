import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildDesignScene, disposeTree } from './scene-design.ts';
import { parseProject } from '../project/validation.ts';
import { escapeHtml } from './ui.ts';
import { createFurnitureMesh } from './furniture.ts';

const fixture = () => parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));
test('rotated furniture keeps its physical dimensions in local coordinates', () => {
  const object = fixture().interior.objects[0];
  object.kind = 'stairs'; object.size = {x:1.2,y:2.8,z:3.2};
  object.position = {x:0,y:0,z:0}; object.rotation = {x:0,y:Math.PI/2,z:0}; object.scale = {x:1,y:1,z:1};
  const mesh = createFurnitureMesh(object);
  const bounds = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  assert.ok(Math.abs(bounds.x-3.2)<.001);
  assert.ok(Math.abs(bounds.y-2.8)<.001);
  assert.ok(Math.abs(bounds.z-1.2)<.001);
  disposeTree(mesh);
});
test('scene honors per-room flooring, elevations and complete project lighting', () => {
  const p = fixture(); p.building.floors[0].elevation = 3;
  const { building, lighting, furniture } = buildDesignScene(p);
  const roomFloors = building.children.filter(o => o.userData.roomId) as THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>[];
  assert.equal(roomFloors.length, p.building.rooms.length);
  assert.equal(roomFloors[0].position.y, 2.88);
  const bath = roomFloors.find(o => o.userData.roomId === 'room_bath')!;
  assert.equal(bath.material.color.getHexString(), p.materials.find(m => m.id === 'mat_stone')!.color.slice(1));
  assert.equal(building.getObjectByName('wall_center_n')!.position.y, 3);
  assert.equal(lighting.children.filter(n => n instanceof THREE.Light).length, p.lighting.length);
  const light = lighting.getObjectByName('light_sun') as THREE.DirectionalLight;
  assert.equal(light.intensity, 3);
  disposeTree(building); disposeTree(lighting); disposeTree(furniture);
});
test('nested shared geometry, materials and shadows are disposed exactly once', () => {
  const root = new THREE.Group(), nested = new THREE.Group(); root.add(nested);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  nested.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
  disposeTree(root); assert.equal(root.children.length, 0); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
});
test('architectural details preserve openings and transparent glazing admits sunlight', () => {
  const project=fixture(); const scene=buildDesignScene(project);
  const panes: THREE.Mesh[]=[];
  scene.building.traverse(node=>{if(node instanceof THREE.Mesh && node.name.startsWith('glazing_'))panes.push(node);});
  assert.equal(panes.length,project.building.windows.length);
  assert.ok(panes.length>0);
  assert.ok(panes.every(pane=>!pane.castShadow && (pane.material as THREE.MeshPhysicalMaterial).transparent && !(pane.material as THREE.MeshPhysicalMaterial).depthWrite));
  for(const window of project.building.windows)assert.ok(scene.building.getObjectByName(`sill_${window.id}`));
  assert.ok(scene.building.getObjectByName(`foundation_${project.building.walls[0].id}`));
  disposeTree(scene.building);disposeTree(scene.furniture);disposeTree(scene.lighting);
});
test('UI escaping renders names and quotes as text', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
