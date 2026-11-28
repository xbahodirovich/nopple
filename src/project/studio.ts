import { z } from 'zod';
import { projectSchema, type MoppleProject } from './schema.ts';

/** Studio branding lives outside the saved .mopple format: localStorage on this
 *  device, and an optional `studio` field on the share-link payload only. */
export const STUDIO_STORAGE_KEY = 'nopple_studio_profile';
export const STUDIO_NAME_MAX = 60;
export const STUDIO_LOGO_MAX_BYTES = 20 * 1024;

/** File-signature check: PNG, JPEG or WebP only. SVG and everything else is rejected. */
export function detectImageType(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  if (bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  return null;
}

const LOGO_MIME = /^data:image\/(png|jpeg|webp);base64,/;

function logoBytes(dataUrl: string): Uint8Array | null {
  try {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), c => c.charCodeAt(0));
    return detectImageType(bytes) === null || bytes.length > STUDIO_LOGO_MAX_BYTES ? null : bytes;
  } catch { return null; }
}

/** Rendered only through <img src>, never injected as markup. */
const logoSchema = z.string()
  .max(Math.ceil((STUDIO_LOGO_MAX_BYTES + 2) / 3) * 4 + 24)
  .refine(value => LOGO_MIME.test(value), { message: 'Logo must be a PNG, JPEG or WebP data URL' })
  .refine(value => logoBytes(value) !== null, { message: 'Logo signature or size is invalid' });

export const studioProfileSchema = z.strictObject({
  name: z.string().trim().min(1).max(STUDIO_NAME_MAX),
  logo: logoSchema.optional(),
});
export type StudioProfile = z.infer<typeof studioProfileSchema>;

/** Offline share payload: the project alone (exactly as before), or wrapped with studio branding. */
export const sharePayloadSchema = z.strictObject({ model: projectSchema, studio: studioProfileSchema.optional() });

/** Compressed links (gzip + base64url) mark themselves with this version. */
export const SHARE_VERSION = 2;
/** Decompressed payload cap: legit payloads stay under shareHome's 100 KB JSON bound. */
export const SHARE_DECOMPRESSED_CAP = 128 * 1024;

const compressedShareSchema = z.strictObject({
  version: z.literal(SHARE_VERSION),
  model: projectSchema,
  studio: studioProfileSchema.optional(),
});

export function encodeSharePayload(model: MoppleProject, studio: StudioProfile | null): string {
  if (!studio) return JSON.stringify(model);
  return JSON.stringify({ model, studio });
}

export type DecodedShare = { model: unknown; studio: StudioProfile | null };

/** Old links carry the bare project (or the unversioned wrapper) and keep opening exactly as before. */
export function decodeSharePayload(json: string): DecodedShare {
  const parsed: unknown = JSON.parse(json);
  const compressed = compressedShareSchema.safeParse(parsed);
  if (compressed.success) return { model: compressed.data.model, studio: compressed.data.studio ?? null };
  const wrapper = sharePayloadSchema.safeParse(parsed);
  if (wrapper.success) return { model: wrapper.data.model, studio: wrapper.data.studio ?? null };
  // Malformed studio branding must not block the home: drop the branding, keep the model.
  if (typeof parsed === 'object' && parsed !== null && 'model' in parsed) {
    return { model: (parsed as { model: unknown }).model, studio: null };
  }
  return { model: parsed, studio: null };
}

export function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer().then(buffer => new Uint8Array(buffer));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function base64UrlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error('Invalid share link.');
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)), c => c.charCodeAt(0));
}

/** Versioned share JSON: compressed links carry the studio name only, never the logo. */
export async function compressSharePayload(model: MoppleProject, studio: StudioProfile | null): Promise<Uint8Array> {
  const payload = studio ? { version: SHARE_VERSION, model, studio } : { version: SHARE_VERSION, model };
  return gzipBytes(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Streaming decompression with a hard size cap so gzip bombs fail fast. */
export async function gunzipShare(bytes: Uint8Array, cap = SHARE_DECOMPRESSED_CAP): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) { void reader.cancel().catch(() => {}); throw new Error('Invalid share link.'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid share link.') throw error;
    throw new Error('Invalid share link.'); // decompression failures (bad gzip, checksum) must not leak internals
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function loadStudioProfile(): StudioProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return null;
    const result = studioProfileSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}

export function saveStudioProfile(profile: StudioProfile): void {
  if (typeof localStorage === 'undefined') throw new Error('Studio profile storage is unavailable.');
  localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(profile));
}
