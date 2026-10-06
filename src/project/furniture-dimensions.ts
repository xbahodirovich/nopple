import type { MoppleInteriorObject } from './schema.ts';
export const DEFAULT_FURNITURE_SIZES: Record<MoppleInteriorObject['kind'], { width: number; height: number; depth: number }> = {
  sofa: { width: 2.2, height: 0.8, depth: 0.95 },
  bed: { width: 1.8, height: 0.9, depth: 2.1 },
  table: { width: 1.6, height: 0.75, depth: 0.9 },
  chair: { width: 0.55, height: 0.82, depth: 0.55 },
  cabinet: { width: 1.4, height: 0.85, depth: 0.5 },
  lamp: { width: 0.45, height: 1.5, depth: 0.45 },
  appliance: { width: 0.9, height: 0.9, depth: 0.65 },
  decoration: { width: 0.5, height: 0.7, depth: 0.5 },
};
