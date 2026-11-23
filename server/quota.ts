import { createHash } from 'node:crypto';

export type AiQuotaResult = 'ok' | 'ip_limit' | 'daily_limit' | 'unavailable';

interface Bucket { start: number; count: number }

const clients = new Map<string, Bucket>();
const daily = { day: '', count: 0 };

function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const perIpLimit = () => limit('AI_PER_IP_PER_MINUTE', 10);
const dailyLimit = () => limit('AI_DAILY_CAP', 500);

/**
 * Redis atomically enforces per-IP and deployment-wide daily caps.
 * Returns undefined when Redis is not configured, so the caller can use
 * the process-local counters below.
 */
async function distributedQuota(ip: string): Promise<Exclude<AiQuotaResult, 'unavailable'> | undefined> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const key = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !key) return undefined;
  const minute = Math.floor(Date.now() / 60000);
  const day = new Date().toISOString().slice(0, 10);
  const hash = createHash('sha256').update(ip).digest('hex');
  const script = `local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if b>=tonumber(ARGV[2]) then return -1 end; if a>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],120); redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],172800); return 1`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, '2', `mopple:ip:${hash}:${minute}`, `mopple:day:${day}`, String(perIpLimit()), String(dailyLimit())]),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Quota service unavailable');
  const result = await response.json() as { result?: number; error?: string };
  if (result.error || result.result === undefined) throw new Error('Quota service unavailable');
  if (result.result === 1) return 'ok';
  if (result.result === -1) return 'daily_limit';
  return 'ip_limit';
}

/**
 * Shared by /api/ai/operations and /api/ai/generate. Redis is deployment-wide;
 * the in-memory fallback is process-wide and intended for local or explicit
 * single-process production limits.
 */
export async function consumeAiQuota(ip: string): Promise<AiQuotaResult> {
  let distributed: Exclude<AiQuotaResult, 'unavailable'> | undefined;
  try { distributed = await distributedQuota(ip); }
  catch { return 'unavailable'; }
  if (distributed) return distributed;

  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== day) { daily.day = day; daily.count = 0; clients.clear(); }
  if (daily.count >= dailyLimit()) return 'daily_limit';

  let bucket = clients.get(ip);
  if (!bucket || now - bucket.start >= 60000) clients.set(ip, bucket = { start: now, count: 0 });
  if (bucket.count >= perIpLimit()) return 'ip_limit';
  bucket.count++;
  daily.count++;
  return 'ok';
}

/** Test helper: clears process-local counters without touching Redis. */
export function resetAiQuota(): void {
  clients.clear();
  daily.day = '';
  daily.count = 0;
}
