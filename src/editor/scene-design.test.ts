import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildDesignScene, disposeTree } from './scene-design.ts';
import { parseProject } from '../project/validation.ts';
import { escapeHtml } from './ui.ts';

const fixture = () => parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));
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
test('UI escaping renders names and quotes as text', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
