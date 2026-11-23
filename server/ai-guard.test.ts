import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { callerKeysAllowed, requestIp } from './ai-guard.ts';

const saved = {
  nodeEnv: process.env.NODE_ENV,
  vercel: process.env.VERCEL,
  vercelEnv: process.env.VERCEL_ENV,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test.after(() => {
  restore('NODE_ENV', saved.nodeEnv);
  restore('VERCEL', saved.vercel);
  restore('VERCEL_ENV', saved.vercelEnv);
});

test('requestIp trusts x-forwarded-for on Vercel and the socket elsewhere', () => {
  const req = {
    headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
  try {
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'preview';
    assert.equal(requestIp(req), '203.0.113.5');
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    assert.equal(requestIp(req), '127.0.0.1', 'standalone must not trust a forgeable header');
    process.env.VERCEL = '1';
    assert.equal(requestIp(req), '203.0.113.5');
  } finally {
    restore('NODE_ENV', saved.nodeEnv);
    restore('VERCEL', saved.vercel);
    restore('VERCEL_ENV', saved.vercelEnv);
  }
});

test('caller keys are allowed only outside production and Vercel', () => {
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    assert.equal(callerKeysAllowed(), false);
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'preview';
    assert.equal(callerKeysAllowed(), false);
    delete process.env.VERCEL_ENV;
    assert.equal(callerKeysAllowed(), true);
  } finally {
    restore('NODE_ENV', saved.nodeEnv);
    restore('VERCEL', saved.vercel);
    restore('VERCEL_ENV', saved.vercelEnv);
  }
});
