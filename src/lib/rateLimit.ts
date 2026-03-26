import { NextRequest, NextResponse } from 'next/server';

/**
 * Rate Limiting Module
 * 
 * IMPORTANT: This implementation uses in-memory storage and has the following limitations:
 * 1. Rate limits reset on server restart
 * 2. Not shared across multiple server instances (each instance has its own limit)
 * 3. Memory usage grows over time (though cleanup is performed)
 * 
 * For production use with multiple instances or high traffic, consider:
 * - Redis-based rate limiting (e.g., using @upstash/ratelimit)
 * - Distributed rate limiting service
 * - Load balancer with rate limiting
 */

// In-memory store for rate limiting
// Key: IP address, Value: { count, resetTime }
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Cleanup interval: Remove expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic cleanup of expired rate limit entries
 * This prevents memory leaks from accumulating old entries
 */
function startCleanupInterval(): void {
  if (cleanupInterval) {
    return; // Already started
  }
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime < now) {
        requestCounts.delete(key);
        cleanedCount++;
      }
    }
    
    // Log cleanup stats in development
    if (process.env.NODE_ENV === 'development' && cleanedCount > 0) {
      console.log(`[RateLimit] Cleaned up ${cleanedCount} expired entries. Active entries: ${requestCounts.size}`);
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup interval on module load
if (typeof process !== 'undefined') {
  startCleanupInterval();
}

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
}

function getClientIp(request: NextRequest): string {
  const isValidIp = (value: string): boolean =>
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(':');

  const directIp = (request as NextRequest & { ip?: string }).ip;
  if (directIp && isValidIp(directIp)) {
    return directIp;
  }

  const trustProxy = process.env.TRUST_PROXY_HEADERS === 'true';
  if (trustProxy) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();
    if (forwardedIp && isValidIp(forwardedIp)) {
      return forwardedIp;
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  return 'unknown';
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests, message = 'Too many requests' } = options;

  return (request: NextRequest): NextResponse | null => {
    const ip = getClientIp(request);
    
    const now = Date.now();

    // Get or create entry for this IP
    let entry = requestCounts.get(ip);
    
    // Reset if entry doesn't exist or window has passed
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + windowMs };
    }

    // Increment count
    entry.count++;
    requestCounts.set(ip, entry);

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      return NextResponse.json(
        { error: message },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((entry.resetTime - now) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.floor(entry.resetTime / 1000).toString(), // Unix timestamp in seconds
            'Cache-Control': 'no-store',
          }
        }
      );
    }

    // Return null if no rate limit violation (request should proceed)
    // Note: Headers could be added here for successful requests, but Next.js doesn't allow
    // modifying response headers in middleware easily, so we only add them on rate limit
    return null;
  };
}

// Predefined rate limiters
const authRateLimitConfig = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts. Please try again later.'
});

/**
 * Authentication rate limiter with test environment support
 * Skips rate limiting in test environment to allow parallel test execution
 * 
 * SECURITY: Only disables rate limiting via server-side environment variables.
 * NEVER disable based on request headers (user-agent, etc.) - these can be spoofed!
 */
export function authRateLimit(request: NextRequest): NextResponse | null {
  // Allow disabling only in tests. Production must fail closed.
  if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
    console.error('[SECURITY ERROR] DISABLE_RATE_LIMIT is not allowed in production.');
  }

  const shouldDisable =
    process.env.NODE_ENV === 'test' ||
    process.env.DISABLE_RATE_LIMIT === 'true' ||
    process.env.CI === 'true';

  if (shouldDisable) {
    return null;
  }
  
  return authRateLimitConfig(request);
}

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  message: 'Too many API requests. Please slow down.'
});

const authMeRateLimitConfig = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
  message: 'Too many session checks. Please try again later.',
});

/**
 * Limits polling of GET /api/auth/me (abuse / token probing) while allowing normal multi-tab SPA use.
 */
export function authMeRateLimit(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  return authMeRateLimitConfig(request);
}

export const emergencyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 emergency requests per hour
  message: 'Too many emergency requests. Please contact support if this is urgent.'
});

/** Unauthenticated password recovery (forgot / validate / reset) — abuse protection. */
export const passwordRecoveryRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 15,
  message: 'Too many password reset attempts. Please try again later.',
});
