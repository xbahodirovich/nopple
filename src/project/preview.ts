import { MoppleProjectEngine } from './engine.ts';
import type { MoppleProject } from './schema.ts';
import type { MoppleOperations } from './operations.ts';
import { interpretPromptLocally, isHouseRequest, requestAiOperations } from '../editor/ai.ts';
import { AI_SELECTION_REQUIRED, type AiSelection } from './ai-context.ts';
import { LocalEditUnsupported } from './local-edit-error.ts';
import { previewSelectionEdit, previewSelectionOperations } from './selection-preview.ts';

export interface DesignPreview { project: MoppleProject; revision: number; title: string; changes: number; focusRoomId?: string }

export function previewLocalEdit(engine: MoppleProjectEngine, prompt: string, selectedId?: string): DesignPreview {
  if (!prompt.trim()) throw new Error('Describe a change first.');
  if (isHouseRequest(prompt)) throw new Error('Use Your brief to create a home.');
  let operations: MoppleOperations['operations'];
  try {
    operations = interpretPromptLocally(prompt, engine.getSnapshot(), selectedId);
  } catch (error) {
    throw new LocalEditUnsupported(error instanceof Error ? error.message : 'The local interpreter could not handle this request.', { cause: error });
  }
  if (!operations.length) throw new LocalEditUnsupported('Try a room size, furniture move, floor material or lighting change.');
  if (operations.some(op => op.type === 'create_house' || op.type === 'update_design_brief')) throw new Error('Use Your brief to replace the home.');
  const draft = new MoppleProjectEngine(engine.getSnapshot());
  draft.applyOperations({ operations });
  return { project: draft.getSnapshot(), revision: engine.revision, title: prompt, changes: operations.length };
}

/**
 * Tries the offline interpreter first. Only an unsupported local request with
 * an explicit selection reaches the hosted service, and the result is always a
 * scratch preview that the user must apply.
 */
export async function previewEditWithAi(
  engine: MoppleProjectEngine,
  prompt: string,
  selection?: AiSelection,
  options: { signal?: AbortSignal } = {},
): Promise<DesignPreview> {
  try {
    return selection
      ? previewSelectionEdit(engine, selection, prompt)
      : previewLocalEdit(engine, prompt);
  } catch (error) {
    if (!(error instanceof LocalEditUnsupported)) throw error;
    if (!selection) throw new Error(AI_SELECTION_REQUIRED);
    const revision = engine.revision;
    const project = engine.getSnapshot();
    const operations = await requestAiOperations(prompt, project, selection, options);
    return previewSelectionOperations(project, selection, operations, revision, prompt);
  }
}

export function applyDesignPreview(engine: MoppleProjectEngine, preview: DesignPreview): void {
  if (engine.revision !== preview.revision) throw new Error('Your home changed after this preview. Preview the change again.');
  const project = structuredClone(preview.project);
  project.project.updatedAt = new Date(Math.max(Date.now(), Date.parse(project.project.updatedAt))).toISOString();
  engine.importProject(JSON.stringify(project));
}
