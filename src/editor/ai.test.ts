import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretPromptLocally } from './ai.ts';
import { MoppleProjectEngine } from '../project/engine.ts';
import { readFile } from 'node:fs/promises';

const example = await readFile(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8');
import { parseProject } from '../project/validation.ts';
import { validateOperations } from '../project/operations.ts';

test('AI local interpreter: room resizing', () => {
  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  const ops = interpretPromptLocally('make the bedroom larger by 1m', project);
  assert.ok(ops.length > 0);
  assert.equal(ops[0].type, 'resize_room');
  assert.equal(ops[0].targetId, 'room_bedroom');

  const validated = validateOperations({ operations: ops });
  assert.doesNotThrow(() => engine.applyOperations(validated));
});

test('AI local interpreter: replace furniture', () => {
  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  const ops = interpretPromptLocally('replace the sofa with a dining table', project);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, 'remove_object');
  assert.equal(ops[1].type, 'add_object');
  if (ops[1].type === 'add_object') {
    assert.equal(ops[1].object.kind, 'table');
  }

  const validated = validateOperations({ operations: ops });
  assert.doesNotThrow(() => engine.applyOperations(validated));
});

test('AI local interpreter: change floor material', () => {
  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  const ops = interpretPromptLocally('change bedroom floor to dark oak', project);
  assert.ok(ops.length >= 2);
  assert.equal(ops[0].type, 'change_material');
  assert.equal(ops[1].type, 'update_room');

  const validated = validateOperations({ operations: ops });
  assert.doesNotThrow(() => engine.applyOperations(validated));
});

test('AI local interpreter: update lighting mood', () => {
  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  const ops = interpretPromptLocally('set warm evening lighting mood', project);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'update_lighting');

  const validated = validateOperations({ operations: ops });
  assert.doesNotThrow(() => engine.applyOperations(validated));
});

test('NVIDIA NIM GLM 5.3 Flash model configuration defaults and persistence', async () => {
  // Mock localStorage for Node test runner
  const storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (idx: number) => Array.from(storage.keys())[idx] ?? null,
    length: storage.size,
  } as Storage;

  const { DEFAULT_AI_MODEL, getStoredModel, setStoredModel } = await import('./ai.ts');
  assert.equal(DEFAULT_AI_MODEL, 'z-ai/glm-5.3-flash');
  assert.equal(getStoredModel(), 'z-ai/glm-5.3-flash');

  // Custom model selection
  setStoredModel('meta/llama-3.3-70b-instruct');
  assert.equal(getStoredModel(), 'meta/llama-3.3-70b-instruct');

  // Legacy gemini model migration to GLM 5.3 Flash
  setStoredModel('gemini-3.1-pro-preview');
  assert.equal(getStoredModel(), 'z-ai/glm-5.3-flash');

  setStoredModel('');
  assert.equal(getStoredModel(), 'z-ai/glm-5.3-flash');
});

test('AI local interpreter: multiple items, wall colors, rotation, cozy and styles', () => {
  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  // 1. Add multiple items
  const opsChairs = interpretPromptLocally('add 2 chairs to living room', project);
  assert.equal(opsChairs.length, 2);
  assert.equal(opsChairs[0].type, 'add_object');
  assert.equal(opsChairs[1].type, 'add_object');
  assert.doesNotThrow(() => engine.applyOperations(validateOperations({ operations: opsChairs })));

  // 2. Wall color
  const opsWalls = interpretPromptLocally('make walls blue', project);
  assert.ok(opsWalls.length >= 2);
  assert.equal(opsWalls[0].type, 'change_material');
  assert.equal(opsWalls[1].type, 'update_room');
  assert.doesNotThrow(() => engine.applyOperations(validateOperations({ operations: opsWalls })));

  // 3. Rotate furniture
  const opsRotate = interpretPromptLocally('rotate the sofa', project);
  assert.equal(opsRotate.length, 1);
  assert.equal(opsRotate[0].type, 'move_object');
  assert.doesNotThrow(() => engine.applyOperations(validateOperations({ operations: opsRotate })));

  // 4. Cozy atmosphere
  const opsCozy = interpretPromptLocally('make the living room cozy and warm', project);
  assert.ok(opsCozy.length >= 1);
  assert.equal(opsCozy[0].type, 'update_lighting');
  assert.doesNotThrow(() => engine.applyOperations(validateOperations({ operations: opsCozy })));

  // 5. Architectural style
  const opsStyle = interpretPromptLocally('make it a minimalist house', project);
  assert.ok(opsStyle.length > 0);
  assert.equal(opsStyle[0].type, 'change_room_style');
  assert.doesNotThrow(() => engine.applyOperations(validateOperations({ operations: opsStyle })));
});

test('AI responses reject extra fields and guessed targets instead of rewriting intent', async () => {
  const { sanitizeOperations } = await import('./ai.ts');
  const p = parseProject(example), engine = new MoppleProjectEngine(p);
  assert.throws(() => sanitizeOperations({ thought: 'extra', operations: [{ type: 'remove_object', targetId: 'object_sofa' }] }, p));
  const operations = sanitizeOperations({ operations: [{ type: 'resize_room', targetId: 'room_unknown', width: 5, depth: 5 }] }, p);
  assert.throws(() => engine.applyOperations(operations), /Unknown target/);
  assert.deepEqual(engine.getSnapshot(), p);
});

test('offline requests distinguish furniture nouns and move versus add', () => {
  const p = parseProject(example);
  const chair = interpretPromptLocally('add a chair to the bedroom', p)[0];
  assert.equal(chair.type, 'add_object');
  if (chair.type === 'add_object') { assert.equal(chair.object.kind, 'chair'); assert.equal(chair.object.roomId, 'room_bedroom'); }
  assert.equal(interpretPromptLocally('add a floor lamp', p)[0].type, 'add_object');
  const move = interpretPromptLocally('move the sofa 1m left', p)[0];
  assert.equal(move.type, 'move_object');
  if (move.type === 'move_object') assert.equal(move.position.x, p.interior.objects[0].position.x - 1);
});

test('house creation builds exact requested room counts and area, and supports undo', async () => {
  const { polygonArea, roomPolygon } = await import('../project/geometry.ts');
  const p = parseProject(example), e = new MoppleProjectEngine(p);
  const ops = interpretPromptLocally('Create a modern 150m² house with 3 bedrooms and 2 bathrooms', p);
  assert.equal(ops[0].type, 'create_house'); e.applyOperations({ operations: ops });
  const next = e.getSnapshot();
  assert.equal(next.building.rooms.filter(r => r.type === 'bedroom').length, 3);
  assert.equal(next.building.rooms.filter(r => r.type === 'bathroom').length, 2);
  assert.ok(Math.abs(next.building.rooms.reduce((area, r) => area + polygonArea(roomPolygon(next, r)), 0) - 150) < 1e-6);
  assert.ok(next.building.doors.length > 3); assert.ok(next.building.windows.length > 3);
  e.undo(); assert.deepEqual(e.getSnapshot(), p);
});

test('API failure never falls back to a different edit; stale responses never overwrite new work', async () => {
  const { executeAiPrompt, setStoredApiKey } = await import('./ai.ts');
  const original = globalThis.fetch; const e = new MoppleProjectEngine(parseProject(example));
  setStoredApiKey('nvapi-test');
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 });
    const before = e.saveProject();
    await assert.rejects(executeAiPrompt('move the sofa left', e), /Invalid API key/);
    assert.equal(e.saveProject(), before);
    let resolveRequest: (response: Response) => void = () => {};
    globalThis.fetch = () => new Promise(resolve => { resolveRequest = resolve; });
    const request = executeAiPrompt('move the sofa left', e);
    await assert.rejects(executeAiPrompt('add a bed', e), /already running/);
    e.renameProject('New work');
    resolveRequest(new Response(JSON.stringify({ operations: [{ type: 'remove_object', targetId: 'object_sofa' }] })));
    await assert.rejects(request, /project changed/);
    assert.ok(e.getSnapshot().interior.objects.some(o => o.id === 'object_sofa'));
  } finally { globalThis.fetch = original; setStoredApiKey(''); }
});
