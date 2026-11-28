import type { IncomingMessage } from 'node:http';

/** Hosted AI is opt-in. Both endpoints fail closed when this is not exactly "true". */
export function aiFallbackEnabled(): boolean {
  return process.env.AI_FALLBACK_ENABLED === 'true';
}

/**
 * A caller-supplied NVIDIA key is a local-development convenience only.
 * Vercel previews also use the server key, not a browser-supplied key.
 */
export function callerKeysAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV === undefined;
}

/**
 * Hosted mode is the safe default: server-key spending requires an enforced
 * quota. Only an explicitly local environment opts out — VERCEL_ENV=development
 * from `vercel dev`, or NODE_ENV=development outside Vercel. A NODE_ENV
 * override inside a Vercel deployment cannot disable hosted enforcement.
 */
export function hostedAiMode(): boolean {
  if (process.env.VERCEL_ENV !== undefined) return process.env.VERCEL_ENV !== 'development';
  return process.env.NODE_ENV !== 'development';
}

export function resolveAuthorization(req: IncomingMessage): string | undefined {
  const caller = req.headers.authorization;
  const server = process.env.NVIDIA_API_KEY ? `Bearer ${process.env.NVIDIA_API_KEY}` : undefined;
  return callerKeysAllowed() ? caller ?? server : server;
}

export function validAuthorization(authorization: string | undefined): authorization is string {
  return Boolean(authorization?.startsWith('Bearer nvapi-') && authorization.length <= 1024);
}

function explicitLocalCaps(): boolean {
  const perIp = process.env.AI_PER_IP_PER_MINUTE;
  const daily = process.env.AI_DAILY_CAP;
  return perIp !== undefined && perIp.trim() !== ''
    && daily !== undefined && daily.trim() !== ''
    && Number.isFinite(Number(perIp)) && Number(perIp) >= 0
    && Number.isFinite(Number(daily)) && Number(daily) >= 0;
}

/** Returns a 503 message when a hosted deployment lacks a usable quota. */
export function quotaConfigurationIssue(): string | undefined {
  if (!hostedAiMode()) return undefined;
  const redis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (redis) return undefined;
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
    return 'A distributed AI quota is required on Vercel. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.';
  }
  return explicitLocalCaps()
    ? undefined
    : 'A rate limit is required in production. Configure AI_PER_IP_PER_MINUTE and AI_DAILY_CAP, or Upstash Redis.';
}

export function requestIp(req: IncomingMessage): string {
  // Vercel's edge proxy sets this header; on a standalone server a caller can
  // forge it, so only the socket address is trustworthy there.
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined) {
    const forwarded = req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || 'local';
}
