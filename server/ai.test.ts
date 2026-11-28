import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { handleAiRequest } from './ai.ts';
import { resetAiQuota } from './quota.ts';

const project: unknown = JSON.parse(readFileSync(new URL('../examples/modern-house.mopple', import.meta.url), 'utf8'));
const saved = {
  flag: process.env.AI_FALLBACK_ENABLED,
  nodeEnv: process.env.NODE_ENV,
  vercelEnv: process.env.VERCEL_ENV,
};

test.before(() => {
  process.env.AI_FALLBACK_ENABLED = 'true';
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
});
test.after(() => {
  if (saved.flag === undefined) delete process.env.AI_FALLBACK_ENABLED; else process.env.AI_FALLBACK_ENABLED = saved.flag;
  if (saved.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.nodeEnv;
  if (saved.vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercelEnv;
});
test.beforeEach(() => resetAiQuota());

async function request(response: Response, operationsPrompt = 'move the sofa left', authorization: string | null = 'Bearer nvapi-test', model = 'z-ai/glm-5.3-flash') {
  const req = Readable.from([Buffer.from(JSON.stringify({ prompt: operationsPrompt, model, project }))]) as IncomingMessage;
  req.method = 'POST'; req.headers = { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) };
  let status = 0, body = ''; const res = new EventEmitter() as ServerResponse;
  res.writeHead = ((code: number) => { status = code; return res; }) as ServerResponse['writeHead'];
  res.end = ((data: string) => { body = data; return res; }) as ServerResponse['end'];
  let upstreamBody = '', upstreamAuthorization = '';
  await handleAiRequest(req, res, async (_url, init) => {
    upstreamBody = String(init?.body);
    upstreamAuthorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
    return response.clone();
  });
  return { status, body, upstreamBody, upstreamAuthorization };
}
const answer = (operations: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(operations) } }] }));

test('server sends full geometry and returns validated operations', async () => {
  const result = await request(answer({ operations: [{ type: 'move_object', targetId: 'object_sofa', position: { x: -3, y: 0, z: 1 } }] }));
  assert.equal(result.status, 200); assert.match(result.upstreamBody, /wall_center_n/); assert.match(result.upstreamBody, /clear_thinking/);
  assert.match(result.upstreamBody, /"max_tokens":2048/);
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
test('hosted credential needs no visitor key and retries validation failures once',async()=>{
 const original=process.env.NVIDIA_API_KEY;process.env.NVIDIA_API_KEY='nvapi-hosted';
 try{
  const req=Readable.from([Buffer.from(JSON.stringify({prompt:'move the sofa left',model:'z-ai/glm-5.3-flash',project,mode:'EDIT'}))]) as IncomingMessage;req.method='POST';req.headers={'content-type':'application/json'};
  const res=new EventEmitter() as ServerResponse;let status=0,calls=0,correction='';res.writeHead=((code:number)=>{status=code;return res;}) as ServerResponse['writeHead'];res.end=(()=>res) as ServerResponse['end'];
  await handleAiRequest(req,res,async(_url,init)=>{calls++;assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer nvapi-hosted');correction=String(init?.body);return answer({operations:calls===1?[{type:'remove_object',targetId:'missing'}]:[{type:'remove_object',targetId:'object_sofa'}]});});
  assert.equal(status,200);assert.equal(calls,2);assert.match(correction,/Previous response failed validation/);
 }finally{if(original===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=original;}
});
test('Vercel parsed request bodies are accepted',async()=>{
 const req=Readable.from([]) as IncomingMessage & {body:unknown};req.body={prompt:'move sofa',model:'z-ai/glm-5.3-flash',project};req.method='POST';req.headers={'content-type':'application/json',authorization:'Bearer nvapi-test','x-forwarded-for':'test-parsed'};
 const res=new EventEmitter() as ServerResponse;let status=0;res.writeHead=((code:number)=>{status=code;return res;}) as ServerResponse['writeHead'];res.end=(()=>res) as ServerResponse['end'];
 await handleAiRequest(req,res,async()=>answer({operations:[{type:'remove_object',targetId:'object_sofa'}]}));assert.equal(status,200);
});
test('server returns 503 when AI_FALLBACK_ENABLED is off', async () => {
  process.env.AI_FALLBACK_ENABLED = 'false';
  try {
    const result = await request(answer({}));
    assert.equal(result.status, 503);
    assert.match(result.body, /disabled/);
  } finally { process.env.AI_FALLBACK_ENABLED = 'true'; }
});
test('production and Vercel preview never use caller-supplied keys', async () => {
  const nodeEnv = process.env.NODE_ENV, vercelEnv = process.env.VERCEL_ENV, key = process.env.NVIDIA_API_KEY;
  const perIp = process.env.AI_PER_IP_PER_MINUTE, daily = process.env.AI_DAILY_CAP;
  try {
    delete process.env.NVIDIA_API_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL_ENV;
    const production = await request(answer({}), 'move sofa', 'Bearer nvapi-caller');
    assert.equal(production.status, 503, 'missing server key is unavailable, not authenticated');
    assert.equal(production.upstreamAuthorization, '', 'caller key must not reach the provider');
    process.env.VERCEL_ENV = 'preview';
    const preview = await request(answer({}), 'move sofa', 'Bearer nvapi-caller');
    assert.equal(preview.status, 503);
    assert.equal(preview.upstreamAuthorization, '');

    delete process.env.VERCEL_ENV;
    process.env.NVIDIA_API_KEY = 'nvapi-hosted';
    process.env.AI_PER_IP_PER_MINUTE = '10'; process.env.AI_DAILY_CAP = '10';
    const hosted = await request(answer({ operations: [{ type: 'remove_object', targetId: 'object_sofa' }] }), 'move sofa', 'Bearer nvapi-caller');
    assert.equal(hosted.status, 200);
    assert.equal(hosted.upstreamAuthorization, 'Bearer nvapi-hosted');
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = vercelEnv;
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
    if (perIp === undefined) delete process.env.AI_PER_IP_PER_MINUTE; else process.env.AI_PER_IP_PER_MINUTE = perIp;
    if (daily === undefined) delete process.env.AI_DAILY_CAP; else process.env.AI_DAILY_CAP = daily;
  }
});
test('missing NVIDIA_API_KEY returns a generic 503, not 401', async () => {
  const key = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    const result = await request(answer({}), 'move sofa', null);
    assert.equal(result.status, 503);
    assert.match(result.body, /unavailable/i);
    assert.doesNotMatch(result.body, /NVIDIA_API_KEY|nvapi/i);
    assert.equal(result.upstreamAuthorization, '');
  } finally {
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
  }
});
test('production requires quota configuration when no Redis is present', async () => {
  const nodeEnv = process.env.NODE_ENV, vercelEnv = process.env.VERCEL_ENV, key = process.env.NVIDIA_API_KEY;
  const perIp = process.env.AI_PER_IP_PER_MINUTE, daily = process.env.AI_DAILY_CAP;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL, redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.NODE_ENV = 'production'; delete process.env.VERCEL_ENV;
    process.env.NVIDIA_API_KEY = 'nvapi-hosted';
    delete process.env.AI_PER_IP_PER_MINUTE; delete process.env.AI_DAILY_CAP;
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const result = await request(answer({}), 'move sofa');
    assert.equal(result.status, 503);
    assert.match(result.body, /rate limit/i);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = vercelEnv;
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
    if (perIp === undefined) delete process.env.AI_PER_IP_PER_MINUTE; else process.env.AI_PER_IP_PER_MINUTE = perIp;
    if (daily === undefined) delete process.env.AI_DAILY_CAP; else process.env.AI_DAILY_CAP = daily;
    if (redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    if (redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  }
});
test('Vercel preview requires Redis quota even with explicit local caps', async () => {
  const nodeEnv = process.env.NODE_ENV, vercelEnv = process.env.VERCEL_ENV, key = process.env.NVIDIA_API_KEY;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL, redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.NODE_ENV = 'production'; process.env.VERCEL_ENV = 'preview';
    process.env.NVIDIA_API_KEY = 'nvapi-hosted';
    process.env.AI_PER_IP_PER_MINUTE = '10'; process.env.AI_DAILY_CAP = '500';
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const result = await request(answer({}), 'move sofa');
    assert.equal(result.status, 503);
    assert.match(result.body, /distributed AI quota/i);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = vercelEnv;
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
    if (redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    if (redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  }
});
test('hosted mode is the default when the environment is unset', async () => {
  const nodeEnv = process.env.NODE_ENV, vercelEnv = process.env.VERCEL_ENV, key = process.env.NVIDIA_API_KEY;
  const perIp = process.env.AI_PER_IP_PER_MINUTE, daily = process.env.AI_DAILY_CAP;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL, redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.NVIDIA_API_KEY = 'nvapi-hosted';
    delete process.env.NODE_ENV; delete process.env.VERCEL_ENV;
    delete process.env.AI_PER_IP_PER_MINUTE; delete process.env.AI_DAILY_CAP;
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const result = await request(answer({}), 'move sofa');
    assert.equal(result.status, 503, 'unset environments must fail safe with a quota error');
    assert.match(result.body, /rate limit/i);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = vercelEnv;
    if (key === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = key;
    if (perIp === undefined) delete process.env.AI_PER_IP_PER_MINUTE; else process.env.AI_PER_IP_PER_MINUTE = perIp;
    if (daily === undefined) delete process.env.AI_DAILY_CAP; else process.env.AI_DAILY_CAP = daily;
    if (redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    if (redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  }
});
test('global daily cap returns 503 for every caller', async () => {
  const daily = process.env.AI_DAILY_CAP;
  process.env.AI_DAILY_CAP = '0';
  try {
    const result = await request(answer({}));
    assert.equal(result.status, 503);
    assert.match(result.body, /daily limit/i);
  } finally {
    if (daily === undefined) delete process.env.AI_DAILY_CAP; else process.env.AI_DAILY_CAP = daily;
  }
});
test('a non-allowlisted model falls back to the default and is never forwarded', async () => {
  const result = await request(
    answer({ operations: [{ type: 'remove_object', targetId: 'object_sofa' }] }),
    'move sofa', 'Bearer nvapi-test', 'gemini-3.1-pro-preview',
  );
  assert.equal(result.status, 200);
  assert.match(result.upstreamBody, /"model":"z-ai\/glm-5.3-flash"/);
  assert.doesNotMatch(result.upstreamBody, /gemini/i);
});
test('per-IP cap returns 429 without consuming the daily cap twice', async () => {
  const perIp = process.env.AI_PER_IP_PER_MINUTE, daily = process.env.AI_DAILY_CAP;
  process.env.AI_PER_IP_PER_MINUTE = '1'; process.env.AI_DAILY_CAP = '10';
  try {
    assert.equal((await request(answer({ operations: [{ type: 'remove_object', targetId: 'object_sofa' }] }))).status, 200);
    assert.equal((await request(answer({}))).status, 429);
  } finally {
    if (perIp === undefined) delete process.env.AI_PER_IP_PER_MINUTE; else process.env.AI_PER_IP_PER_MINUTE = perIp;
    if (daily === undefined) delete process.env.AI_DAILY_CAP; else process.env.AI_DAILY_CAP = daily;
  }
});
