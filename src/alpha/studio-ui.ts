import { detectImageType, loadStudioProfile, saveStudioProfile, STUDIO_LOGO_MAX_BYTES, type StudioProfile } from '../project/studio.ts';

/** Decoded byte size of a base64 data URL payload. */
function encodedSize(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)) * 3 / 4);
}

/** Signature-checked, downscaled to at most 256 px, capped at 20 KB encoded. No SVG. */
async function logoDataUrl(file: File): Promise<string> {
  if (detectImageType(new Uint8Array(await file.arrayBuffer())) === null) throw new Error('Logo must be PNG, JPEG or WebP.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Browsers without WebP encoding silently return PNG here, which the schema also accepts.
  for (const quality of [.85, .6, .35]) {
    const url = canvas.toDataURL('image/webp', quality);
    if (encodedSize(url) <= STUDIO_LOGO_MAX_BYTES) return url;
  }
  const png = canvas.toDataURL('image/png');
  if (encodedSize(png) <= STUDIO_LOGO_MAX_BYTES) return png;
  throw new Error('Logo is too large after downscaling. Use a simpler image.');
}

export function initStudioBranding(): void {
  const panel = document.querySelector<HTMLDetailsElement>('#studio-branding');
  if (!panel) return;
  const name = panel.querySelector<HTMLInputElement>('#studio-name')!, file = panel.querySelector<HTMLInputElement>('#studio-logo')!;
  const preview = panel.querySelector<HTMLImageElement>('#studio-logo-preview')!, status = panel.querySelector<HTMLElement>('#studio-status')!;
  const save = panel.querySelector<HTMLButtonElement>('#studio-save')!;
  const existing = loadStudioProfile();
  let logo: string | undefined;
  if (existing) {
    name.value = existing.name;
    if (existing.logo) { logo = existing.logo; preview.src = existing.logo; preview.hidden = false; }
  }
  file.addEventListener('change', () => { void (async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    try { logo = await logoDataUrl(selected); preview.src = logo; preview.hidden = false; status.textContent = ''; }
    catch (error) { logo = undefined; preview.hidden = true; status.textContent = error instanceof Error ? error.message : 'Logo could not be used.'; }
  })(); });
  save.addEventListener('click', () => {
    const value = name.value.trim();
    if (!value) { status.textContent = 'Enter a studio name.'; return; }
    const profile: StudioProfile = logo ? { name: value, logo } : { name: value };
    try { saveStudioProfile(profile); status.textContent = 'Studio profile saved.'; }
    catch { status.textContent = 'Studio profile storage is unavailable.'; }
  });
}
