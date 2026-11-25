import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProject } from './validation.ts';
import {
  detectImageType, encodeSharePayload, decodeSharePayload, loadStudioProfile, saveStudioProfile,
  sharePayloadSchema, studioProfileSchema, STUDIO_NAME_MAX,
} from './studio.ts';
import type { MoppleProject } from './schema.ts';

const example = await readFile(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8');
const fixture = () => parseProject(example) as MoppleProject;

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0, 1]);

test('detectImageType accepts PNG, JPEG and WebP signatures and rejects the rest', () => {
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(JPEG), 'jpeg');
  assert.equal(detectImageType(WEBP), 'webp');
  assert.equal(detectImageType(Uint8Array.from(Buffer.from('GIF89a'))), null);
  assert.equal(detectImageType(Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))), null);
  assert.equal(detectImageType(new Uint8Array(0)), null);
});

test('old links without a studio field decode to the bare model', () => {
  const model = fixture();
  const decoded = decodeSharePayload(JSON.stringify(model));
  assert.equal(decoded.studio, null);
  assert.deepEqual(decoded.model, model);
});

test('wrapped payloads round-trip model and studio', () => {
  const model = fixture();
  const studio = { name: 'Bog‘cha Studio', logo: `data:image/png;base64,${base64(PNG)}` };
  const decoded = decodeSharePayload(encodeSharePayload(model, studio));
  assert.deepEqual(decoded.model, model);
  assert.deepEqual(decoded.studio, studio);
});

test('shares without studio keep the exact legacy payload shape', () => {
  const model = fixture();
  assert.equal(encodeSharePayload(model, null), JSON.stringify(model));
});

test('a name containing HTML is preserved as plain data for textContent rendering', () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const result = studioProfileSchema.safeParse({ name: hostile });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.name, hostile);
  const decoded = decodeSharePayload(encodeSharePayload(fixture(), { name: hostile }));
  assert.equal(decoded.studio?.name, hostile);
});

test('names above the 60-character limit drop the studio but keep the model', () => {
  const model = fixture();
  const payload = JSON.stringify({ model, studio: { name: 'S'.repeat(STUDIO_NAME_MAX + 1) } });
  const decoded = decodeSharePayload(payload);
  assert.equal(decoded.studio, null);
  assert.deepEqual(decoded.model, model);
});

test('blank or whitespace-only names are rejected', () => {
  assert.equal(sharePayloadSchema.safeParse({ model: fixture(), studio: { name: '   ' } }).success, false);
});

test('oversized logos (over 20 KB decoded) are rejected', () => {
  const tooBig = new Uint8Array(20 * 1024 + 1);
  tooBig.set(PNG.subarray(0, 8), 0);
  const logo = `data:image/png;base64,${base64(tooBig)}`;
  assert.equal(studioProfileSchema.safeParse({ name: 'Studio', logo }).success, false);
  assert.equal(sharePayloadSchema.safeParse({ model: fixture(), studio: { name: 'Studio', logo } }).success, false);
});

test('a logo at exactly 20 KB decoded passes', () => {
  const exact = new Uint8Array(20 * 1024);
  exact.set(PNG.subarray(0, 8), 0);
  assert.equal(studioProfileSchema.safeParse({ name: 'Studio', logo: `data:image/png;base64,${base64(exact)}` }).success, true);
});

test('wrong logo types are rejected by mime and file signature', () => {
  assert.equal(studioProfileSchema.safeParse({ name: 'Studio', logo: `data:image/svg+xml;base64,${base64(PNG)}` }).success, false);
  // claims PNG but carries a GIF signature
  assert.equal(studioProfileSchema.safeParse({ name: 'Studio', logo: `data:image/png;base64,${base64(Uint8Array.from(Buffer.from('GIF89a')) )}` }).success, false);
  assert.equal(studioProfileSchema.safeParse({ name: 'Studio', logo: 'not-a-data-url' }).success, false);
});

test('non-object studio fields fall back to the legacy branch', () => {
  const model = fixture();
  const decoded = decodeSharePayload(JSON.stringify({ model, studio: 'handed a string' }));
  assert.equal(decoded.studio, null);
  assert.deepEqual(decoded.model, model);
});

test('studio profile storage round-trips and rejects corrupt data', () => {
  const store = new Map<string, string>();
  const stub = globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } };
  const original = stub.localStorage;
  stub.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };
  try {
    assert.equal(loadStudioProfile(), null);
    const profile = { name: 'Studio One' };
    saveStudioProfile(profile);
    assert.deepEqual(loadStudioProfile(), profile);
    store.set('nopple_studio_profile', '{not json');
    assert.equal(loadStudioProfile(), null);
    store.set('nopple_studio_profile', JSON.stringify({ name: 42 }));
    assert.equal(loadStudioProfile(), null);
  } finally { stub.localStorage = original; }
});
