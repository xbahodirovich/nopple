import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { executeGeneration, handleGenerationRequest } from './generation.ts';
import { resetAiQuota } from './quota.ts';
import { designBriefSchema, createApprovalToken } from '../src/project/brief.ts';
import { EventEmitter } from 'node:events';

const savedFlag = process.env.AI_FALLBACK_ENABLED;
const savedNodeEnv = process.env.NODE_ENV;
const savedVercelEnv = process.env.VERCEL_ENV;
test.before(() => {
  process.env.AI_FALLBACK_ENABLED = 'true';
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
});
test.after(() => {
  if (savedFlag === undefined) delete process.env.AI_FALLBACK_ENABLED; else process.env.AI_FALLBACK_ENABLED = savedFlag;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedNodeEnv;
  if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = savedVercelEnv;
});
test.beforeEach(() => resetAiQuota());

const sampleBrief = designBriefSchema.parse({
  request: 'A modern 2-floor villa with 4 bedrooms, 3 bathrooms, an office and courtyard',
  area: 220,
  bedrooms: 4,
  bathrooms: 3,
  floors: 2,
  style: 'Warm modern Scandinavian',
  site: 'South-facing corner plot in Seattle',
  household: 'Family with two kids and an elderly parent requiring ground-floor accessible room',
  spaces: 'Home office, courtyard, and laundry',
  materials: 'Oak wood floors, limestone tiles, large floor-to-ceiling glass',
  budget: '650000 USD',
  lighting: 'Abundant daylight with western evening sun',
  interiorViews: 'Living room towards courtyard, and master bedroom suite',
});

test('generation API rejects unverified or tampered approval tokens', async () => {
  await assert.rejects(
    executeGeneration({
      approvedBrief: sampleBrief,
      approvalToken: 'appr_invalid_token',
      projectRevision: 0,
    }),
    /Invalid or unverified approval token/
  );
});

test('generation API creates multi-floor project and reports requirement coverage', async () => {
  const token = createApprovalToken(sampleBrief);
  const job = await executeGeneration({
    approvedBrief: sampleBrief,
    approvalToken: token,
    projectRevision: 0,
    idempotencyKey: 'idemp_test_1',
  });

  assert.equal(job.status, 'succeeded');
  assert.equal(job.stage, 'complete');
  assert.equal(job.progress, 100);
  assert.ok(job.generatedProject);

  const project = job.generatedProject!;
  assert.equal(project.building.floors.length, 2);
  assert.equal(project.building.rooms.filter(r => r.type === 'bedroom').length, 4);
  assert.equal(project.building.rooms.filter(r => r.type === 'bathroom').length, 3);
  assert.ok(project.interior.objects.some(o => o.kind === 'stairs'));

  // Requirement coverage report
  assert.ok(job.coverageReport.fulfilled.length >= 4);
  assert.ok(job.coverageReport.fulfilled.some(f => f.includes('2 floor(s)')));
  assert.ok(job.coverageReport.fulfilled.some(f => f.includes('stairs')));
  assert.ok(job.coverageReport.fulfilled.some(f => f.includes('Accessibility')));

  assert.equal(job.artifacts.filter(a => a.type === 'exterior_render').length, 5);
  assert.equal(job.artifacts.find(a => a.id === 'render_exterior_street')?.provenance.camera?.y, 1.6);

  // Artifacts manifest
  assert.ok(job.artifacts.length >= 4);
  assert.ok(job.artifacts.every(a => a.provenance.approvalToken === token));
  assert.ok(job.artifacts.filter(a => a.type === 'interior_render').every(a => a.provenance.camera?.fov === 65));
});

test('HTTP generation endpoint handles GET status and POST generate', async () => {
  const token = createApprovalToken(sampleBrief);
  const payload = JSON.stringify({
    approvedBrief: sampleBrief,
    approvalToken: token,
    projectRevision: 1,
    idempotencyKey: 'idemp_http_test',
  });

  // Mock request & response
  class MockRequest extends EventEmitter {
    method = 'POST';
    url = '/api/ai/generate';
    headers = { 'content-type': 'application/json', authorization: 'Bearer nvapi-test' };
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload);
    }
    iterator() {
      return this[Symbol.asyncIterator]();
    }
    resume() {}
  }

  let responseStatus = 0;
  let responseData = '';
  const mockRes = {
    writeHead(status: number) { responseStatus = status; },
    end(data?: string) { responseData = data ?? ''; },
  };

  await handleGenerationRequest(new MockRequest() as any, mockRes as any);
  assert.equal(responseStatus, 200);
  const body = JSON.parse(responseData);
  assert.equal(body.status, 'succeeded');
  assert.equal(body.brief.area, 220);
  const query = new MockRequest(); query.method = 'GET';
  await handleGenerationRequest(query as any, mockRes as any);
  assert.equal(responseStatus, 400, 'job enumeration is unavailable');
  query.url = `/api/ai/generate?jobId=${body.id}`;
  await handleGenerationRequest(query as any, mockRes as any);
  assert.equal(responseStatus, 403, 'private brief cannot be read without its capability');
  Object.assign(query.headers, {authorization: `Bearer ${body.accessToken}`});
  await handleGenerationRequest(query as any, mockRes as any);
  assert.equal(responseStatus, 200);
  const cancel = new MockRequest(); cancel.url = `/api/ai/generate/cancel?jobId=${body.id}`;
  await handleGenerationRequest(cancel as any, mockRes as any);
  assert.equal(responseStatus, 403);
  Object.assign(cancel.headers, {authorization: `Bearer ${body.accessToken}`});
  await handleGenerationRequest(cancel as any, mockRes as any);
  assert.equal(responseStatus, 200);
  assert.equal(JSON.parse(responseData).job.status, 'cancelled');
});

test('HTTP generation endpoint is disabled by AI_FALLBACK_ENABLED', async () => {
  const req = Readable.from([]) as IncomingMessage;
  req.method = 'POST'; req.url = '/api/ai/generate'; req.headers = { 'content-type': 'application/json' };
  let status = 0, body = '';
  const res = { writeHead(code: number) { status = code; }, end(data?: string) { body = data ?? ''; } };
  process.env.AI_FALLBACK_ENABLED = 'false';
  try {
    await handleGenerationRequest(req, res as unknown as ServerResponse);
    assert.equal(status, 503);
    assert.match(body, /disabled/);
  } finally { process.env.AI_FALLBACK_ENABLED = 'true'; }
});

test('HTTP generation endpoint returns 503 when the server key is missing', async () => {
  const key = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    const req = Readable.from([]) as IncomingMessage;
    req.method = 'POST'; req.url = '/api/ai/generate'; req.headers = { 'content-type': 'application/json' };
    let status = 0, body = '';
    const res = { writeHead(code: number) { status = code; }, end(data?: string) { body = data ?? ''; } };
    await handleGenerationRequest(req, res as unknown as ServerResponse);
    assert.equal(status, 503);
    assert.match(body, /unavailable/i);
    assert.doesNotMatch(body, /NVIDIA_API_KEY|nvapi/i);
  } finally {
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
  }
});
