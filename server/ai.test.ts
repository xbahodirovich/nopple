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
  await handleAiRequest(req, res, async (_url, init) => { upstreamBody = String(init?.body); return response.clone(); });
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
test('hosted credential needs no visitor key and retries validation failures once',async()=>{
 const original=process.env.NVIDIA_API_KEY;process.env.NVIDIA_API_KEY='nvapi-hosted';
 try{
  const req=Readable.from([Buffer.from(JSON.stringify({prompt:'move the sofa left',model:'z-ai/glm-5.3-flash',project,mode:'EDIT'}))]) as IncomingMessage;req.method='POST';req.headers={'content-type':'application/json'};
  const res=new EventEmitter() as ServerResponse;let status=0,calls=0,correction='';res.writeHead=((code:number)=>{status=code;return res;}) as ServerResponse['writeHead'];res.end=(()=>res) as ServerResponse['end'];
  await handleAiRequest(req,res,async(_url,init)=>{calls++;assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer nvapi-hosted');correction=String(init?.body);return answer({operations:calls===1?[{type:'remove_object',targetId:'missing'}]:[{type:'remove_object',targetId:'object_sofa'}]});});
  assert.equal(status,200);assert.equal(calls,2);assert.match(correction,/Previous response failed validation/);
 }finally{if(original===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=original;}
});
test('Vercel parsed request bodies are accepted and zero daily caps reject work',async()=>{
 const req=Readable.from([]) as IncomingMessage & {body:unknown};req.body={prompt:'move sofa',model:'z-ai/glm-5.3-flash',project};req.method='POST';req.headers={'content-type':'application/json',authorization:'Bearer nvapi-test','x-forwarded-for':'test-parsed'};
 const res=new EventEmitter() as ServerResponse;let status=0;res.writeHead=((code:number)=>{status=code;return res;}) as ServerResponse['writeHead'];res.end=(()=>res) as ServerResponse['end'];
 await handleAiRequest(req,res,async()=>answer({operations:[{type:'remove_object',targetId:'object_sofa'}]}));assert.equal(status,200);
 const cap=process.env.AI_DAILY_CAP;process.env.AI_DAILY_CAP='0';try{assert.equal((await request(answer({}))).status,429);}finally{if(cap===undefined)delete process.env.AI_DAILY_CAP;else process.env.AI_DAILY_CAP=cap;}
});
