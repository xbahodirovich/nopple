import type { MoppleProjectEngine } from './engine.ts';
import { MAX_FILE_BYTES, MoppleValidationError } from './validation.ts';

/** File input or drag/drop entry point. Invalid imports preserve the current project. */
export async function importMoppleFile(engine: MoppleProjectEngine, file: Pick<File, 'name' | 'size' | 'text'>): Promise<void> {
  if (!/\.mopple$/i.test(file.name)) throw new MoppleValidationError([{ path: 'file', message: 'Expected a .mopple file' }]);
  if (file.size > MAX_FILE_BYTES) throw new MoppleValidationError([{ path: 'file', message: 'Project exceeds 5 MiB limit' }]);
  engine.importProject(await file.text());
}

/** Build a download payload without requiring the DOM (also usable in tests/servers). */
export function exportMoppleFile(engine: MoppleProjectEngine): { filename: string; contents: string; mimeType: string } {
  const stem = engine.getSnapshot().project.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'project';
  return { filename: `${stem.toLowerCase()}.mopple`, contents: engine.saveProject(), mimeType: 'application/json' };
}

/** Call from a future Export button; importing this module has no browser side effects. */
export function downloadMoppleFile(engine: MoppleProjectEngine): void {
  const { filename, contents, mimeType } = exportMoppleFile(engine);
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
