export type Stage = 0 | 1 | 2;
export interface HouseState { roof: number; interior: number; plan: number }
export const STATES: readonly HouseState[] = [
  { roof: 0, interior: 0, plan: 0 },
  { roof: 1, interior: 1, plan: 0 },
  { roof: 1, interior: 1, plan: 1 },
];
export const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;
export function blend(a: HouseState, b: HouseState, t: number): HouseState {
  const k = ease(t);
  return { roof: a.roof + (b.roof - a.roof) * k, interior: a.interior + (b.interior - a.interior) * k, plan: a.plan + (b.plan - a.plan) * k };
}
export const STAGE_PROGRESS = [0, 0.5, 1] as const;

// Pure position mapping: revisiting any scroll offset restores exactly the same house.
export function sampleScroll(progress: number): { state: HouseState; stage: Stage } {
  const p = Math.min(1, Math.max(0, progress));
  const stage: Stage = p < .27 ? 0 : p < .73 ? 1 : 2;
  if (p <= .1) return { state: { ...STATES[0] }, stage };
  if (p < .44) return { state: blend(STATES[0], STATES[1], (p - .1) / .34), stage };
  if (p <= .56) return { state: { ...STATES[1] }, stage };
  if (p < .9) return { state: blend(STATES[1], STATES[2], (p - .56) / .34), stage };
  return { state: { ...STATES[2] }, stage };
}
