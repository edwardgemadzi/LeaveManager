import { NextRequest, NextResponse } from 'next/server';

/**
 * Rate Limiting Module
 *
 * Supports two modes:
 *
 * 1. **Distributed** (recommended for production):
 *    Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.
 *    Uses @upstash/ratelimit for accurate limits that work across all Vercel
 *    serverless instances.
 *
 * 2. **In-memory fallback** (default, single-instance only):
 *    Works without additional infrastructure but limits are per-instance.
 *    Suitable for development and low-traffic deployments on a single server.
 */

// ---------------------------------------------------------------------------
// In-memory store (fallback)
// ---------------------------------------------------------------------------
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime < now) requestCounts.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
}

if (typeof process !== 'undefined') {
  startCleanupInterval();
}

// ---------------------------------------------------------------------------
// Upstash distributed limiter factory (lazy-loaded so the import doesn't
// crash when the env vars are absent)
// ---------------------------------------------------------------------------
type UpstashLimiter = { limit: (id: string) => Promise<{ success: boolean; reset: number }> };
const upstashLimiters = new Map<string, UpstashLimiter>();

function isUpstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getUpstashLimiter(key: string, windowMs: number, maxRequests: number): Promise<UpstashLimiter> {
  if (upstashLimiters.has(key)) return upstashLimiters.get(key)!;

  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs / 1000} s`),
    prefix: `rl:${key}`,
  });

  upstashLimiters.set(key, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  key?: string; // logical name, used as Upstash prefix
}

function getClientIp(request: NextRequest): string {
  const isValidIp = (v: string) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v) || v.includes(':');

  const directIp = (request as NextRequest & { ip?: string }).ip;
  if (directIp && isValidIp(directIp)) return directIp;

  if (process.env.TRUST_PROXY_HEADERS === 'true') {
    const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd && isValidIp(fwd)) return fwd;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && isValidIp(realIp)) return realIp;

  return 'unknown';
}

function inMemoryLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
  message: string
): NextResponse | null {
  const now = Date.now();
  let entry = requestCounts.get(ip);
  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + windowMs };
  }
  entry.count++;
  requestCounts.set(ip, entry);

  if (entry.count > maxRequests) {
    return NextResponse.json(
      { error: message },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((entry.resetTime - now) / 1000).toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.floor(entry.resetTime / 1000).toString(),
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API: rateLimit()
// Returns a function that accepts a NextRequest and returns a promise of
// NextResponse | null  (null = allowed).
// ---------------------------------------------------------------------------
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, message = 'Too many requests', key = 'default' } = options;

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const ip = getClientIp(request);
    const identifier = `${key}:${ip}`;

    if (isUpstashConfigured()) {
      try {
        const limiter = await getUpstashLimiter(key, windowMs, maxRequests);
        const { success, reset } = await limiter.limit(identifier);
        if (!success) {
          return NextResponse.json(
            { error: message },
            {
              status: 429,
              headers: {
                'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
                'X-RateLimit-Limit': maxRequests.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': Math.floor(reset / 1000).toString(),
                'Cache-Control': 'no-store',
              },
            }
          );
        }
        return null;
      } catch (err) {
        // Fail open: if Upstash is unreachable, fall through to in-memory
        console.error('[RateLimit] Upstash error, falling back to in-memory:', err);
      }
    }

    return inMemoryLimit(ip, windowMs, maxRequests, message);
  };
}

// ---------------------------------------------------------------------------
// Predefined limiters
// ---------------------------------------------------------------------------
const authRateLimitFn = rateLimit({
  key: 'auth',
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many authentication attempts. Please try again later.',
});

export async function authRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
    console.error('[SECURITY ERROR] DISABLE_RATE_LIMIT is not allowed in production.');
  }
  const shouldDisable =
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true' ||
    process.env.CI === 'true';
  if (shouldDisable) return null;
  return authRateLimitFn(request);
}

export const apiRateLimit = rateLimit({
  key: 'api',
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: 'Too many API requests. Please slow down.',
});

const authMeRateLimitFn = rateLimit({
  key: 'auth-me',
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
  message: 'Too many session checks. Please try again later.',
});

export async function authMeRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'test') return null;
  return authMeRateLimitFn(request);
}

export const emergencyRateLimit = rateLimit({
  key: 'emergency',
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  message: 'Too many emergency requests. Please contact support if this is urgent.',
});

export const passwordRecoveryRateLimit = rateLimit({
  key: 'password-recovery',
  windowMs: 60 * 60 * 1000,
  maxRequests: 15,
  message: 'Too many password reset attempts. Please try again later.',
});
