import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject, MoppleProjectEngine } from './engine.ts';
import { createProjectViews, subscribeProjectViews, type MoppleProjectViews } from './adapters.ts';
import { exportMoppleFile, importMoppleFile } from './files.ts';
import { MAX_FILE_BYTES, MoppleValidationError, parseProject, validateProject } from './validation.ts';
import { validateOperations } from './operations.ts';
import type { MoppleProject } from './schema.ts';

const example = await readFile(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8');
const fixture = () => parseProject(example);
const engine = () => new MoppleProjectEngine(fixture(), { now: () => '2026-09-20T00:00:00.000Z' });

test('realistic example and empty project round-trip without losing design data', () => {
  const p = fixture();
  assert.equal(p.building.rooms.length, 4);
  assert.equal(p.interior.objects.length, 6);
  assert.deepEqual(parseProject(new MoppleProjectEngine(p).saveProject()), p);
  const empty = createProject('New home', { id: 'project_test', now: '2026-09-19T00:00:00Z' });
  assert.deepEqual(validateProject(empty), empty);
  assert.equal(empty.project.units, 'meters');
});

const invalid: [string, (p: MoppleProject) => void][] = [
  ['duplicate IDs', p => { p.building.walls[0].id = p.building.rooms[0].id; }],
  ['missing wall', p => { p.building.doors[0].wallId = 'wall_missing'; }],
  ['missing room', p => { p.interior.objects[0].roomId = 'room_missing'; }],
  ['missing floor', p => { p.building.walls[0].floorId = 'floor_missing'; }],
  ['missing material', p => { p.building.rooms[0].materials = { floor: 'mat_missing' }; }],
  ['missing override material', p => { p.interior.objects[0].materialOverrides = [{ slot: 'seat', materialId: 'mat_missing' }]; }],
  ['negative dimension', p => { p.building.walls[0].thickness = -1; }],
  ['zero scale', p => { p.interior.objects[0].scale.y = 0; }],
  ['NaN', p => { p.building.walls[0].start.x = NaN; }],
  ['Infinity', p => { p.interior.objects[0].position.z = Infinity; }],
  ['zero length wall', p => { p.building.walls[0].end = { ...p.building.walls[0].start }; }],
  ['opening outside wall', p => { p.building.doors[0].position = 0; }],
  ['opening above wall', p => { p.building.windows[0].sillHeight = 2; }],
  ['overlapping openings', p => { p.building.doors.push({ ...p.building.doors[0], id: 'door_overlap' }); }],
  ['broken boundary', p => { p.building.rooms[0].boundary[0].reversed = true; }],
  ['repeated boundary', p => { p.building.rooms[0].boundary[1] = { ...p.building.rooms[0].boundary[0] }; }],
  ['height exceeds floor', p => { p.building.rooms[0].height = 8; }],
  ['timestamps out of order', p => { p.project.updatedAt = '2020-01-01T00:00:00Z'; }],
  ['zero light direction', p => { p.lighting = [{ id: 'light_test', type: 'directional', color: '#ffffff', intensity: 1, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }]; }],
];
for (const [name, change] of invalid) test(`rejects ${name}`, () => {
  const p = fixture(); change(p);
  assert.throws(() => validateProject(p), MoppleValidationError);
});

test('rejects malformed JSON, unknown versions, enums, fields and missing properties', () => {
  for (const text of ['{', 'null', '[]', example.replace('"version": "1.0"', '"version": "9.0"'), example.replace('"type": "kitchen"', '"type": "invalid"'), example.replace('"height": 2.8', '"height": 1e309')]) {
    assert.throws(() => parseProject(text), MoppleValidationError);
  }
  assert.throws(() => validateProject({ ...fixture(), camera: {} }), MoppleValidationError);
  assert.throws(() => validateProject({ ...fixture(), building: {} }), MoppleValidationError);
  assert.throws(() => parseProject(' '.repeat(MAX_FILE_BYTES + 1)), MoppleValidationError);
});

test('rejects a closed self-intersecting room polygon', () => {
  const p = createProject();
  p.building.floors = [{ id: 'floor_test', name: 'Test', elevation: 0, height: 3 }];
  const points = [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }, { x: 3, z: 0 }];
  p.building.walls = points.map((start, i) => ({ id: `wall_${i}`, floorId: 'floor_test', start, end: points[(i + 1) % 4], height: 3, thickness: .2 }));
  p.building.rooms = [{ id: 'room_test', name: 'Invalid', type: 'custom', floorId: 'floor_test', height: 3, boundary: p.building.walls.map(w => ({ wallId: w.id, reversed: false })) }];
  assert.throws(() => validateProject(p), /simple, nonzero-area polygon/);
});

test('AI operations reject arbitrary code, unknown commands and malformed inputs', () => {
  for (const input of [null, { operations: [] }, { operations: [{ type: 'execute', code: 'alert(1)' }] }, { operations: [{ type: 'move_object', targetId: 'object_sofa', position: { x: NaN, y: 0, z: 0 } }] }, { operations: [{ type: 'remove_object', targetId: 'object_sofa', code: 'bad' }] }]) {
    assert.throws(() => validateOperations(input), MoppleValidationError);
  }
});

test('failed batches and imports leave both data and subscribers unchanged', () => {
  const e = engine(), before = e.saveProject(); let notifications = 0;
  e.subscribe(() => notifications++);
  assert.throws(() => e.applyOperations({ operations: [
    { type: 'move_object', targetId: 'object_sofa', position: { x: 1, y: 0, z: 1 } },
    { type: 'remove_object', targetId: 'object_missing' },
  ] }), MoppleValidationError);
  assert.throws(() => e.importProject('{'), MoppleValidationError);
  assert.throws(() => e.removeWall('wall_nw'), MoppleValidationError);
  assert.throws(() => e.moveWall('wall_sw', { x: 1.1, z: 4 }, { x: 1, z: 4 }), MoppleValidationError);
  assert.equal(e.saveProject(), before);
  assert.equal(notifications, 0);
});

test('wall edits update connected room polygons and all three projections in one notification', () => {
  const e = engine(), revisions: MoppleProjectViews[] = [];
  const stop = subscribeProjectViews(e, views => revisions.push(views));
  e.moveWall('wall_center_n', { x: 1.6, z: -4 }, { x: 1.6, z: 0 });
  assert.equal(revisions.length, 2);
  const next = revisions[1];
  for (const view of [next.architecture, next.interior, next.scene]) {
    assert.equal(view.rooms.find(r => r.id === 'room_kitchen')!.polygon[1].x, 1.6);
    assert.equal(view.walls.find(w => w.id === 'wall_ne')!.start.x, 1.6);
    const moved = view.walls.find(w => w.id === 'wall_center_n')!;
    assert.equal(moved.openings[0].center.x, 1.6);
    assert.equal(moved.openings[0].position, .72);
  }
  assert.equal(e.getSnapshot().project.updatedAt, '2026-09-20T00:00:00.000Z');
  stop(); e.updateRoom('room_kitchen', { name: 'New kitchen' });
  assert.equal(revisions.length, 2);
});

test('rectangular resize preserves IDs, updates shared walls, and rejects unsupported shapes', () => {
  const e = engine();
  e.applyOperations({ operations: [{ type: 'resize_room', targetId: 'room_living', width: 7, depth: 4 }] });
  const rooms = createProjectViews(e.getSnapshot()).architecture.rooms;
  assert.deepEqual(rooms.find(r => r.id === 'room_living')!.polygon, [{ x: -5, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 4 }, { x: -5, z: 4 }]);
  assert.throws(() => e.applyOperations({ operations: [{ type: 'resize_room', targetId: 'room_kitchen', width: 7, depth: 4 }] }), /axis-aligned/);
});

test('snapshots, constructor inputs, operation inputs, and subscribers cannot mutate engine state', () => {
  const original = fixture(), e = new MoppleProjectEngine(original);
  original.project.name = 'Changed';
  e.getSnapshot().building.walls[0].height = -1;
  e.subscribe(p => { p.project.name = 'Corrupted'; });
  let observed = '';
  e.subscribe(p => { observed = p.project.name; });
  const position = { x: -2, y: 0, z: 1 };
  e.moveInteriorObject('object_sofa', position);
  position.x = 999;
  assert.equal(e.getSnapshot().project.name, 'Modern House');
  assert.equal(observed, 'Modern House');
  assert.equal(e.getSnapshot().interior.objects[0].position.x, -2);
});

test('subscriber exceptions and reentrant writes cannot interrupt delivery or corrupt commits', () => {
  const errors: unknown[] = [], e = new MoppleProjectEngine(fixture(), { onSubscriberError: error => errors.push(error) });
  let delivered = 0;
  e.subscribe(() => { throw new Error('renderer failure'); });
  e.subscribe(() => e.removeInteriorObject('object_sofa'));
  e.subscribe(() => delivered++);
  e.updateRoom('room_kitchen', { name: 'Kitchen updated' });
  assert.equal(delivered, 1); assert.equal(errors.length, 2);
  assert.equal(e.getSnapshot().interior.objects.length, 6);
});

test('controlled APIs build a room, openings, materials, furniture and lighting from scratch', () => {
  const e = new MoppleProjectEngine(createProject());
  const source = fixture();
  e.addFloor(source.building.floors[0]);
  source.materials.forEach(m => e.changeMaterial(m));
  source.building.walls.forEach(w => e.addWall(w));
  source.building.rooms.forEach(r => e.addRoom(r));
  source.building.doors.forEach(d => e.addDoor(d));
  source.building.windows.forEach(w => e.addWindow(w));
  e.addInteriorObject(source.interior.objects[0]);
  e.updateLighting(source.lighting);
  e.updateWall('wall_nw', { thickness: .25 });
  e.applyOperations({ operations: [{ type: 'change_room_style', targetId: 'room_kitchen', style: 'minimal' }] });
  e.removeInteriorObject('object_sofa');
  e.addWall({ id: 'wall_spare', floorId: 'floor_ground', start: { x: 20, z: 0 }, end: { x: 21, z: 0 }, height: 2, thickness: .2 });
  e.removeWall('wall_spare');
  assert.equal(e.getSnapshot().building.rooms[0].style, 'minimal');
  assert.equal(e.getSnapshot().interior.objects.length, 0);
  assert.equal(e.getSnapshot().lighting.length, 2);
  assert.equal(e.getSnapshot().building.walls.length, 12);
});

test('wall openings use floor elevation and canonical right-handed rotation', () => {
  const p = fixture(); p.building.floors[0].elevation = 3;
  const view = createProjectViews(p).scene;
  const wall = view.walls.find(w => w.id === 'wall_center_n')!;
  assert.equal(wall.rotationY, -Math.PI / 2);
  assert.equal(wall.openings[0].center.y, 4.05);
});

test('file helpers safely export, import, and reject bad filenames and oversized files', async () => {
  const e = engine(), file = exportMoppleFile(e);
  assert.equal(file.filename, 'modern-house.mopple');
  const other = new MoppleProjectEngine();
  await importMoppleFile(other, { name: file.filename, size: file.contents.length, text: async () => file.contents });
  assert.deepEqual(other.getSnapshot(), e.getSnapshot());
  const before = other.saveProject();
  for (const input of [
    { name: 'house.json', size: 1, text: async () => example },
    { name: 'house.mopple', size: MAX_FILE_BYTES + 1, text: async () => example },
    { name: 'house.mopple', size: 1, text: async () => '{' },
  ]) await assert.rejects(importMoppleFile(other, input), MoppleValidationError);
  assert.equal(other.saveProject(), before);
});
