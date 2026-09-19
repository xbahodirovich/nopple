import example from '../../examples/modern-house.mopple?raw';
import { MoppleProjectEngine } from './engine.ts';
import { parseProject } from './validation.ts';

/** Future application modes import this one session, never create per-mode stores. */
export const projectEngine = new MoppleProjectEngine(parseProject(example));
