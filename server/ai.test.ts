import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { handleAiRequest } from './ai.ts';

const project: unknown = JSON.parse(readFileSync(new URL('../examples/modern-house.mopple', import.meta.url), 'utf8'));
async function request(response: Response, operationsPrompt = 'move the sofa left', authorization = 'Bearer nvapi-test') {
  const req = Readable.from([Buffer.from(JSON.stringify({ prompt: operationsPrompt, model: 'z-ai/glm-5.3-flash', project }))]) as IncomingMessage;
  req.method = 'POST'; req.headers = { 'content-type': 'application/json', authorization };
  let status = 0, body = ''; const res = new EventEmitter() as ServerResponse;
  res.writeHead = ((code: number) => { status = code; return res; }) as ServerResponse['writeHead'];
  res.end = ((data: string) => { body = data; return res; }) as ServerResponse['end'];
  let upstreamBody = '';
  await handleAiRequest(req, res, async (_url, init) => { upstreamBody = String(init?.body); return response; });
  return { status, body, upstreamBody };
}
const answer = (operations: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(operations) } }] }));
test('server sends full geometry and returns validated operations', async () => {
  const result = await request(answer({ operations: [{ type: 'move_object', targetId: 'object_sofa', position: { x: -3, y: 0, z: 1 } }] }));
  assert.equal(result.status, 200); assert.match(result.upstreamBody, /wall_center_n/); assert.match(result.upstreamBody, /clear_thinking/);
});
test('server rejects bad IDs, missing transforms and unexpected operations atomically', async () => {
  for (const operations of [
    [{ type: 'remove_object', targetId: 'missing' }],
    [{ type: 'move_object', targetId: 'object_sofa' }],
    [{ type: 'execute', code: 'bad' }],
    [{ type: 'create_house', area: 150, bedrooms: 3, bathrooms: 2, style: 'modern' }],
  ]) assert.equal((await request(answer({ operations }))).status, 422);
});
test('server reports authentication, rate limit, malformed and empty provider responses', async () => {
  assert.equal((await request(answer({}), 'move sofa', 'Bearer other-key')).status, 401);
  assert.equal((await request(new Response('', { status: 401 }))).status, 401);
  assert.equal((await request(new Response('', { status: 429 }))).status, 429);
  assert.equal((await request(new Response('not json'))).status, 422);
  assert.equal((await request(new Response(JSON.stringify({ choices: [{ message: { content: '' } }] })))).status, 422);
});
