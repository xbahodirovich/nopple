import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MoppleProjectEngine } from './engine.ts';
import { parseProject } from './validation.ts';
import { applyDesignPreview, previewEditWithAi } from './preview.ts';

const example = readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8');
const engine = () => new MoppleProjectEngine(parseProject(example));

test('local commands preview without contacting the hosted service', async () => {
  const project = engine();
  const before = project.getSnapshot();
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error('network should not be used'); }) as typeof fetch;
  try {
    const preview = await previewEditWithAi(project, 'remove the sofa', { type: 'room', id: 'room_living' });
    assert.equal(called, false);
    assert.equal(preview.project.interior.objects.some(item => item.id === 'object_sofa'), false);
    assert.deepEqual(project.getSnapshot(), before);
  } finally { globalThis.fetch = original; }
});

test('unsupported requests without a selection show the exact message and do not call AI', async () => {
  const project = engine();
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  try {
    await assert.rejects(
      previewEditWithAi(project, 'nudge the sofa left'),
      (error: unknown) => error instanceof Error && error.message === 'Select a room, wall, or object first',
    );
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});

test('unsupported selected edits fall back to a scoped AI preview and never apply', async () => {
  const project = engine();
  const before = project.getSnapshot();
  const sofa = before.interior.objects.find(item => item.id === 'object_sofa')!;
  const original = globalThis.fetch;
  let captured: {
    headers: Record<string, string>;
    body: { project: { building: { rooms: { id: string }[] }; interior: { objects: { id: string }[] } } };
  } | undefined;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    captured = { headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ operations: [{ type: 'move_object', targetId: sofa.id, position: { ...sofa.position, x: sofa.position.x - 0.5 } }] }));
  }) as typeof fetch;
  try {
    const preview = await previewEditWithAi(project, 'nudge this item left', { type: 'object', id: sofa.id });
    assert.equal(captured?.headers.Authorization, undefined);
    assert.equal(captured?.body.project.interior.objects.length, 1);
    assert.equal(captured?.body.project.interior.objects[0].id, sofa.id);
    assert.ok(captured!.body.project.building.rooms.length < before.building.rooms.length);
    assert.deepEqual(project.getSnapshot(), before, 'the live engine is unchanged before approval');
    const moved = preview.project.interior.objects.find(item => item.id === sofa.id)!;
    assert.notDeepEqual(moved.position, sofa.position);
    assert.equal(preview.revision, project.revision);
    applyDesignPreview(project, preview);
    assert.deepEqual(project.getSnapshot().interior.objects.find(item => item.id === sofa.id)!.position, moved.position);
    project.undo();
    assert.deepEqual(project.getSnapshot(), before);
  } finally { globalThis.fetch = original; }
});

test('AI edits outside the selection, house creation and whole-house lighting are refused', async () => {
  const project = engine();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ operations: [{ type: 'remove_object', targetId: 'object_bed' }] }))) as typeof fetch;
    await assert.rejects(
      previewEditWithAi(project, 'nudge this item left', { type: 'object', id: 'object_sofa' }),
      /outside your selection/,
    );

    globalThis.fetch = (async () => new Response(JSON.stringify({ operations: [{ type: 'create_house', area: 150, bedrooms: 3, bathrooms: 2, style: 'modern' }] }))) as typeof fetch;
    await assert.rejects(
      previewEditWithAi(project, 'nudge this item left', { type: 'object', id: 'object_sofa' }),
      /replacing your house/,
    );

    globalThis.fetch = (async () => new Response(JSON.stringify({ operations: [{ type: 'update_lighting', lights: [] }] }))) as typeof fetch;
    await assert.rejects(
      previewEditWithAi(project, 'nudge this item left', { type: 'room', id: 'room_living' }),
      /outside your selection/,
    );
  } finally { globalThis.fetch = original; }
});

test('AI responses cannot overwrite work made while the request is running', async () => {
  const project = engine();
  const original = globalThis.fetch;
  let resolveRequest: (response: Response) => void = () => {};
  globalThis.fetch = (() => new Promise<Response>(resolve => { resolveRequest = resolve; })) as typeof fetch;
  try {
    const pending = previewEditWithAi(project, 'nudge this item left', { type: 'object', id: 'object_sofa' });
    project.renameProject('New work');
    resolveRequest(new Response(JSON.stringify({ operations: [{ type: 'move_object', targetId: 'object_sofa', position: { x: -3, y: 0, z: 1 } }] })));
    const preview = await pending;
    assert.throws(() => applyDesignPreview(project, preview), /changed after this preview/);
    assert.equal(project.getSnapshot().project.name, 'New work');
  } finally { globalThis.fetch = original; }
});
