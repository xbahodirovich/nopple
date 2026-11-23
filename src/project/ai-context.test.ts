import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAiContext, type AiSelection } from './ai-context.ts';
import { parseProject, validateProject } from './validation.ts';

const project = parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));

test('AI context for a selected room, wall and object is schema-valid and scoped', () => {
  const selections: AiSelection[] = [
    { type: 'room', id: 'room_living' },
    { type: 'wall', id: 'wall_center_n' },
    { type: 'object', id: 'object_sofa' },
  ];
  for (const selection of selections) {
    const context = buildAiContext(project, selection);
    assert.doesNotThrow(() => validateProject(context));
    assert.equal(context.project.name, 'Selection edit context');
    assert.equal(context.lighting.length, 0);
    assert.equal(context.metadata.geo, undefined);
    assert.equal(context.metadata.sun, undefined);
    assert.equal(context.metadata.designBrief, undefined);
    if (selection.type !== 'wall') assert.ok(context.building.rooms.length < project.building.rooms.length, `${selection.type} context excludes unrelated rooms`);
  }

  const room = buildAiContext(project, { type: 'room', id: 'room_living' });
  assert.ok(room.building.rooms.some(item => item.id === 'room_living'));
  assert.ok(room.building.rooms.some(item => item.id === 'room_kitchen'), 'one adjacent room is included');
  assert.equal(room.building.rooms.some(item => item.id === 'room_bedroom'), false, 'a two-hop room is excluded');
  assert.ok(room.interior.objects.every(item => item.roomId !== 'room_bedroom'));
  assert.ok(room.building.walls.every(wall => room.building.rooms.some(item => item.boundary.some(edge => edge.wallId === wall.id))));

  const wall = buildAiContext(project, { type: 'wall', id: 'wall_center_n' });
  assert.ok(wall.building.walls.some(item => item.id === 'wall_center_n'));
  assert.ok(wall.building.rooms.some(item => item.id === 'room_kitchen'));
  assert.ok(wall.building.rooms.some(item => item.id === 'room_bedroom'));

  const object = buildAiContext(project, { type: 'object', id: 'object_sofa' });
  assert.ok(object.interior.objects.some(item => item.id === 'object_sofa'));
  assert.equal(object.interior.objects.some(item => item.id === 'object_bed'), false);
  assert.ok(object.building.rooms.some(item => item.id === 'room_living'));
});
