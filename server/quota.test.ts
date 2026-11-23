import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeAiQuota, resetAiQuota } from './quota.ts';

const saved = {
  perIp: process.env.AI_PER_IP_PER_MINUTE,
  daily: process.env.AI_DAILY_CAP,
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test.after(() => {
  restore('AI_PER_IP_PER_MINUTE', saved.perIp);
  restore('AI_DAILY_CAP', saved.daily);
  restore('UPSTASH_REDIS_REST_URL', saved.url);
  restore('UPSTASH_REDIS_REST_TOKEN', saved.token);
});

test.beforeEach(() => {
  resetAiQuota();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.AI_PER_IP_PER_MINUTE;
  delete process.env.AI_DAILY_CAP;
});

test('Redis quota uses one atomic script that increments and expires both counters', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  process.env.AI_PER_IP_PER_MINUTE = '2';
  process.env.AI_DAILY_CAP = '5';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let args: unknown[] = [];
  globalThis.fetch = (async (_input, init) => {
    calls++;
    args = JSON.parse(String(init?.body)) as unknown[];
    return new Response(JSON.stringify({ result: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    assert.equal(await consumeAiQuota('198.51.100.7'), 'ok');
    assert.equal(calls, 1);
    assert.equal(args[0], 'EVAL');
    assert.equal(args[2], '2');
    assert.equal(args[5], '2');
    assert.equal(args[6], '5');
    const script = String(args[1]);
    assert.match(script, /redis\.call\('INCR',KEYS\[1\]\)/);
    assert.match(script, /redis\.call\('EXPIRE',KEYS\[1\],120\)/);
    assert.match(script, /redis\.call\('INCR',KEYS\[2\]\)/);
    assert.match(script, /redis\.call\('EXPIRE',KEYS\[2\],172800\)/);
    assert.ok(script.indexOf("if a>=tonumber(ARGV[1]) then return 0 end") < script.indexOf("redis.call('INCR',KEYS[1])"));
    assert.ok(script.indexOf("if b>=tonumber(ARGV[2]) then return -1 end") < script.indexOf("redis.call('INCR',KEYS[2])"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Redis rejections map to distinct IP and daily outcomes', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  const originalFetch = globalThis.fetch;
  const results = [0, -1];
  globalThis.fetch = (async () => new Response(JSON.stringify({ result: results.shift() }), { status: 200 })) as typeof fetch;
  try {
    assert.equal(await consumeAiQuota('198.51.100.8'), 'ip_limit');
    assert.equal(await consumeAiQuota('198.51.100.8'), 'daily_limit');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a per-IP rejection does not consume the global daily cap', async () => {
  process.env.AI_PER_IP_PER_MINUTE = '1';
  process.env.AI_DAILY_CAP = '2';
  assert.equal(await consumeAiQuota('ip-a'), 'ok');
  assert.equal(await consumeAiQuota('ip-a'), 'ip_limit');
  assert.equal(await consumeAiQuota('ip-b'), 'ok');
  assert.equal(await consumeAiQuota('ip-c'), 'daily_limit');
});
