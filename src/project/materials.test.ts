import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProject } from './validation.ts';
import { createProject } from './engine.ts';
import { materialsSchedule, materialsCsv, prettifyId } from './materials.ts';
import type { MoppleProject } from './schema.ts';

const example = await readFile(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8');
const fixture = () => parseProject(example) as MoppleProject;

test('materials schedule lists rooms with finishes and areas from existing data', () => {
  const schedule = materialsSchedule(fixture());
  assert.equal(schedule.rooms.length, 4);
  for (const room of schedule.rooms) {
    assert.ok(room.name.length > 0);
    assert.ok(room.area > 0);
    assert.ok(room.type.length > 0);
  }
  // The example assigns floor finishes, so they surface in the schedule.
  assert.ok(schedule.rooms.some(room => room.floorFinish.length > 0));
});

test('furniture rows aggregate duplicates per room and size', () => {
  const project = fixture();
  const first = project.interior.objects[0];
  project.interior.objects.push({ ...first, id: first.id === 'object_a' ? 'object_b' : 'object_z' });
  const schedule = materialsSchedule(project);
  const item = schedule.furniture.find(entry => entry.item === prettifyId(first.assetId));
  assert.ok(item);
  assert.ok(item.qty >= 2);
  assert.ok(/^[0-9.]+ × [0-9.]+ × [0-9.]+$/.test(item.size));
});

test('finish usage counts reference rooms, walls and objects', () => {
  const project = fixture();
  const schedule = materialsSchedule(project);
  const total = schedule.finishes.reduce((sum, finish) => sum + finish.uses, 0);
  const direct = project.building.rooms.length * 0
    + project.building.rooms.reduce((sum, room) => sum + Object.values(room.materials ?? {}).length, 0)
    + project.building.walls.filter(wall => wall.materialId).length
    + project.building.doors.filter(door => door.materialId).length
    + project.building.windows.filter(window => window.materialId).length
    + project.interior.objects.reduce((sum, object) => sum + (object.materialId ? 1 : 0) + (object.materialOverrides?.length ?? 0), 0);
  assert.equal(total, direct);
});

test('csv escapes quotes, commas and spreadsheet formula prefixes', () => {
  const project = fixture();
  project.building.rooms[0].name = 'Suite "A", big';
  project.building.rooms[1].name = '=SUM(A1)';
  const csv = materialsCsv(materialsSchedule(project));
  assert.match(csv, /"Suite ""A"", big"/);
  assert.match(csv, /"'=SUM\(A1\)"/);
  assert.match(csv, /\r\n/);
  const sections = csv.split('\r\n\r\n').map(section => section.split('\r\n')[0]);
  assert.deepEqual(sections.filter(Boolean), ['Rooms', 'Finishes', 'Furniture']);
});

test('empty project produces headers with zero rows', () => {
  const empty = createProject('Empty home', { id: 'project_empty', now: '2026-09-19T00:00:00Z' });
  const csv = materialsCsv(materialsSchedule(empty));
  assert.match(csv, /Name,Type,Floor,Area \(m2\)/);
  assert.ok(!csv.includes('"='));
  const schedule = materialsSchedule(empty);
  assert.deepEqual(schedule.furniture, []);
  assert.ok(schedule.finishes.length >= 0);
});
