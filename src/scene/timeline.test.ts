import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleScroll, STATES, STAGE_PROGRESS } from './timeline.ts';

test('scroll endpoints and midpoint show complete house representations', () => {
  STAGE_PROGRESS.forEach((progress, stage) => assert.deepEqual(sampleScroll(progress), { state: STATES[stage], stage }));
  assert.deepEqual(sampleScroll(-1).state, STATES[0]);
  assert.deepEqual(sampleScroll(2).state, STATES[2]);
});
test('every hold-to-transformation boundary is continuous', () => {
  for (const boundary of [.1, .44, .56, .9]) {
    const before = sampleScroll(boundary - .00001).state;
    const after = sampleScroll(boundary + .00001).state;
    for (const key of ['roof', 'interior', 'plan'] as const) assert.ok(Math.abs(before[key] - after[key]) < .001);
  }
});
test('scrolling upward retraces identical intermediate states without wrapping', () => {
  const positions = Array.from({ length: 101 }, (_, i) => i / 100);
  const forward = positions.map(sampleScroll);
  const backward = [...positions].reverse().map(sampleScroll).reverse();
  assert.deepEqual(forward, backward);
  let previous = STATES[0];
  for (const { state } of forward) {
    for (const key of ['roof', 'interior', 'plan'] as const) {
      assert.ok(state[key] >= previous[key] && state[key] <= 1);
    }
    previous = state;
  }
});
