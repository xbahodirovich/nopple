import { MoppleProjectEngine } from './engine.ts';
import type { MoppleProject } from './schema.ts';
import { interpretPromptLocally, isHouseRequest } from '../editor/ai.ts';

export interface DesignPreview { project: MoppleProject; revision: number; title: string; changes: number; focusRoomId?: string }

export function previewLocalEdit(engine: MoppleProjectEngine, prompt: string, selectedId?: string): DesignPreview {
  if (!prompt.trim()) throw new Error('Describe a change first.');
  if (isHouseRequest(prompt)) throw new Error('Use Your brief to create a home.');
  const operations = interpretPromptLocally(prompt, engine.getSnapshot(), selectedId);
  if (!operations.length) throw new Error('Try a room size, furniture move, floor material or lighting change. AI is not connected yet.');
  if (operations.some(op => op.type === 'create_house' || op.type === 'update_design_brief')) throw new Error('Use Your brief to replace the home.');
  const draft = new MoppleProjectEngine(engine.getSnapshot());
  draft.applyOperations({ operations });
  return { project: draft.getSnapshot(), revision: engine.revision, title: prompt, changes: operations.length };
}

export function applyDesignPreview(engine: MoppleProjectEngine, preview: DesignPreview): void {
  if (engine.revision !== preview.revision) throw new Error('Your home changed after this preview. Preview the change again.');
  const project = structuredClone(preview.project);
  project.project.updatedAt = new Date(Math.max(Date.now(), Date.parse(project.project.updatedAt))).toISOString();
  engine.importProject(JSON.stringify(project));
}
