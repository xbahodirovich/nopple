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

test('NVIDIA NIM & GLM 5.3 Flash sanitization: strips extra fields and fixes IDs and transforms', async () => {
  const { sanitizeOperations, sanitizeGeminiOperations } = await import('./ai.ts');
  assert.equal(sanitizeOperations, sanitizeGeminiOperations);

  const project = parseProject(example);
  const engine = new MoppleProjectEngine(project);

  // GLM 5.3 Flash / NIM returns extra fields (thought, explanation) and missing transforms
  const rawNimOutput = {
    thought: 'The user wants a modern armchair in the living room and larger bedroom.',
    operations: [
      {
        type: 'add_object',
        object: {
          id: 'armchair #1',
          assetId: 'chair_nordic',
          roomId: 'room_living',
          kind: 'chair',
          position: { x: 1.2, y: 0, z: -0.5 },
          // missing rotation and scale
          unwanted_meta_field: 'extra data',
        },
      },
      {
        type: 'resize_room',
        targetId: 'Bedroom', // Name instead of ID
        width: 5.5,
        depth: 4.2,
      },
    ],
  };

  const sanitized = sanitizeOperations(rawNimOutput, project);
  assert.equal(sanitized.operations.length, 2);
  assert.equal(sanitized.operations[0].type, 'add_object');
  if (sanitized.operations[0].type === 'add_object') {
    assert.ok(!sanitized.operations[0].object.id.includes('#'));
    assert.deepEqual(sanitized.operations[0].object.scale, { x: 1, y: 1, z: 1 });
    assert.deepEqual(sanitized.operations[0].object.rotation, { x: 0, y: 0, z: 0 });
  }

  // targetId was mapped from 'Bedroom' to 'room_bedroom'
  assert.equal(sanitized.operations[1].type, 'resize_room');
  if (sanitized.operations[1].type === 'resize_room') {
    assert.equal(sanitized.operations[1].targetId, 'room_bedroom');
  }

  assert.doesNotThrow(() => engine.applyOperations(sanitized));
});


