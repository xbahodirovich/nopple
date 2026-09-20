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

test('Gemini 3.1 Pro model configuration defaults and persistence', async () => {
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

  const { DEFAULT_GEMINI_MODEL, getStoredModel, setStoredModel } = await import('./ai.ts');
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.1-pro-preview');
  assert.equal(getStoredModel(), 'gemini-3.1-pro-preview');

  setStoredModel('gemini-3.1-pro-preview-customtools');
  assert.equal(getStoredModel(), 'gemini-3.1-pro-preview-customtools');

  setStoredModel('');
  assert.equal(getStoredModel(), 'gemini-3.1-pro-preview');
});

