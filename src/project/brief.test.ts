import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designBriefSchema, conceptScope } from './brief.ts';
import { createGenerationPlan } from './generation.ts';
import { MoppleProjectEngine } from './engine.ts';
import { parseProject } from './validation.ts';

const brief = designBriefSchema.parse({ request: 'A quiet home with a courtyard', area: 150, bedrooms: 3, bathrooms: 2, floors: 2, style: 'Warm modern', site: 'Tashkent', household: 'Family of four', spaces: 'Courtyard, office, step-free access', materials: 'Oak and limewash', budget: '200000 USD', lighting: 'Western evening sun', interiorViews: 'Kitchen and every bedroom with realistic reflections' });
const fixture = () => parseProject(readFileSync(new URL('../../examples/modern-house.mopple', import.meta.url), 'utf8'));

test('brief requires all answers and rejects unsupported numeric bounds', () => {
  assert.equal(designBriefSchema.safeParse({ ...brief, spaces: ' ' }).success, false);
  assert.equal(designBriefSchema.safeParse({ ...brief, area: 0 }).success, false);
  assert.match(conceptScope(brief).join(' '), /2 floors/);
});

test('concept, complete requirements and sun survive export and atomic undo/redo', () => {
  const engine = new MoppleProjectEngine(fixture());
  const before = engine.getSnapshot();
  engine.applyOperations({ operations: [
    { type: 'create_house', area: brief.area, bedrooms: brief.bedrooms, bathrooms: brief.bathrooms, style: brief.style },
    { type: 'update_design_brief', brief },
    { type: 'update_sun', sun: { mode: 'manual', azimuth: 90, elevation: 25 } },
  ] });
  const saved = parseProject(engine.saveProject());
  assert.deepEqual(saved.metadata.designBrief, brief);
  assert.equal(saved.metadata.sun?.azimuth, 90);
  const plan = createGenerationPlan(saved);
  assert.ok(plan.interiorJobs.length > 0);
  assert.ok(plan.interiorJobs.every(job => job.status === 'not_implemented' && saved.building.rooms.some(room => room.id === job.roomId)));
  assert.match(plan.interiorJobs[0].prompt, /shadows.*reflections/);
  assert.deepEqual(plan.brief, brief);
  engine.undo(); assert.deepEqual(engine.getSnapshot(), before);
  engine.redo(); assert.deepEqual(engine.getSnapshot().metadata.designBrief, brief);
});

test('extractBriefFromPrompt extracts structured entities and flags missing/conflicting topics', async () => {
  const { extractBriefFromPrompt, generateDiscoveryQuestions, createApprovalToken, verifyApprovalToken, applyConversationalCorrection } = await import('./brief.ts');
  const extracted = extractBriefFromPrompt('Design a two-floor 220 m² modern house with 4 bedrooms, 3 bathrooms, an office and courtyard for a family of four in Seattle with oak wood and limestone, budget $650k');
  assert.equal(extracted.brief.floors, 2);
  assert.equal(extracted.brief.area, 220);
  assert.equal(extracted.brief.bedrooms, 4);
  assert.equal(extracted.brief.bathrooms, 3);
  assert.match(extracted.brief.style!, /Modern/i);
  assert.match(extracted.brief.spaces!, /office.*courtyard/i);
  assert.match(extracted.brief.materials!, /oak.*limestone/i);
  assert.match(extracted.brief.household!, /family of four/i);
  assert.match(extracted.brief.budget!, /650k/i);

  const questions = generateDiscoveryQuestions(extracted.missing, extracted.conflicts);
  assert.ok(questions.length >= 1);

  // Approval token round trip
  const fullBrief = { ...brief, approvalToken: undefined };
  const token = createApprovalToken(fullBrief);
  assert.ok(token.startsWith('appr_'));
  assert.equal(verifyApprovalToken(fullBrief, token), true);
  assert.equal(verifyApprovalToken({ ...fullBrief, area: 300 }, token), false);

  // Conversational corrections
  const corrected = applyConversationalCorrection(extracted.brief, 'Actually make it 3 floors and 5 bedrooms');
  assert.equal(corrected.updated.floors, 3);
  assert.equal(corrected.updated.bedrooms, 5);
  assert.ok(corrected.notes.length >= 2);
});
