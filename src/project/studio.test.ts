import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProject } from './validation.ts';
import {
  detectImageType, encodeSharePayload, decodeSharePayload, loadStudioProfile, saveStudioProfile,
  sharePayloadSchema, studioProfileSchema, STUDIO_NAME_MAX,
  SHARE_VERSION, base64UrlDecode, base64UrlEncode, compressSharePayload, gzipBytes, gunzipShare,
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

test('compressed share links round-trip with a version marker and name-only studio', async () => {
  const model = fixture();
  const bytes = await compressSharePayload(model, { name: 'Bog‘cha Studio' });
  const json = new TextDecoder().decode(await gunzipShare(bytes));
  const parsed = JSON.parse(json) as { version?: number; studio?: { name?: string; logo?: string } };
  assert.equal(parsed.version, SHARE_VERSION);
  assert.equal(parsed.studio?.name, 'Bog‘cha Studio');
  assert.equal(parsed.studio?.logo, undefined);
  const url = base64UrlEncode(bytes);
  assert.ok(!url.includes('+') && !url.includes('/') && !url.includes('='), 'base64url must be URL-safe');
  const decoded = decodeSharePayload(new TextDecoder().decode(await gunzipShare(base64UrlDecode(url))));
  assert.deepEqual(decoded.model, model);
  assert.deepEqual(decoded.studio, { name: 'Bog‘cha Studio' });
});

test('compressed links without studio decode to the bare model', async () => {
  const model = fixture();
  const decoded = decodeSharePayload(new TextDecoder().decode(await gunzipShare(await compressSharePayload(model, null))));
  assert.deepEqual(decoded.model, model);
  assert.equal(decoded.studio, null);
});

test('corrupt compressed input fails with clear errors, not crashes', async () => {
  assert.throws(() => base64UrlDecode('not valid base64url!'), /Invalid share link/);
  const notGzip = base64UrlDecode('SGVsbG8='); // decodes fine, but is not gzip
  await assert.rejects(() => gunzipShare(notGzip), /Invalid share link/);
  await assert.rejects(() => gunzipShare(new Uint8Array([1, 2, 3])), /Invalid share link/);
});

test('decompression bombs are capped', async () => {
  const bomb = await gzipBytes(new Uint8Array(2 * 1024 * 1024)); // 2 MB of zeros compresses to a few KB
  assert.ok(bomb.length < 30000, 'test fixture should be small on the wire');
  await assert.rejects(() => gunzipShare(bomb, 128 * 1024), /Invalid share link/);
  // Legit payloads under the cap still decompress.
  const legit = await gzipBytes(new TextEncoder().encode('x'.repeat(100 * 1024)));
  const out = await gunzipShare(legit);
  assert.equal(out.length, 100 * 1024);
});
