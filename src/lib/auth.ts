import jwt, { type SignOptions } from 'jsonwebtoken';
import { AuthUser } from '@/types';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Validate JWT_SECRET on initialization - fail fast if missing or invalid
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable is required and must be at least 32 characters long. ' +
    'Please set JWT_SECRET in your environment variables.'
  );
}

/** Default cookie/JWT lifetime when “Remember me” is on (30 days). */
export const AUTH_REMEMBER_ME_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** JWT lifetime when “Remember me” is off (session-style; cookie has no maxAge). */
export const AUTH_SESSION_JWT_EXPIRES_IN = '12h';

/** JWT lifetime when “Remember me” is on (matches cookie maxAge). */
export const AUTH_REMEMBER_JWT_EXPIRES_IN = '30d';

/**
 * Sign a JWT for the auth cookie. Call sites must pair `expiresIn` with {@link setAuthCookie}
 * `maxAgeSeconds` (or defaults) so the cookie lifetime matches the token `exp` claim.
 */
export const generateToken = (user: AuthUser, expiresIn: string = '7d'): string => {
  return jwt.sign(user, JWT_SECRET, { expiresIn } as SignOptions);
};

interface DecodedToken {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
  // Legacy fields for backward compatibility
  selectedTeamId?: string;
  teamIds?: string[];
}

export const verifyToken = (token: string): AuthUser | null => {
  // Validate token format before attempting verification
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    // Don't log errors for missing tokens - this is expected
    return null;
  }
  
  // Basic JWT format validation (should have 3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    // Invalid JWT format - don't log as error, just return null
    return null;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    // Handle old tokens that might have teamIds/selectedTeamId - map to single teamId
    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      // Use selectedTeamId or first teamIds entry if teamId is missing (for old tokens)
      teamId: decoded.teamId || decoded.selectedTeamId || (decoded.teamIds && decoded.teamIds.length > 0 ? decoded.teamIds[0] : undefined),
    };
  } catch (err) {
    // Only log errors for tokens that look valid but fail verification (expired, invalid signature, etc.)
    // Don't log for malformed tokens - this is expected for invalid tokens
    if (err && typeof err === 'object' && 'name' in err && err.name === 'JsonWebTokenError' && 'message' in err && err.message === 'jwt malformed') {
      // This is expected for invalid tokens - don't log
      return null;
    }
    // Log other JWT errors (expired, invalid signature, etc.)
    console.error('Token verification error:', err);
    return null;
  }
};

export const getTokenFromRequest = (request: Request): string | null => {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    // Return null for empty tokens
    if (token.length === 0) {
      return null;
    }
    return token;
  }

  // Fallback to HttpOnly auth cookie when available (NextRequest).
  const requestWithCookies = request as Request & {
    cookies?: { get: (name: string) => { value: string } | undefined };
  };
  const cookieToken = requestWithCookies.cookies?.get('token')?.value;
  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  return null;
};

function getAllowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>([request.nextUrl.origin]);
  const envAllowed = process.env.CSRF_ALLOWED_ORIGINS;
  if (!envAllowed) {
    return allowed;
  }

  envAllowed
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
    .forEach(origin => {
      try {
        allowed.add(new URL(origin).origin);
      } catch {
        // Ignore malformed configured origin values
      }
    });

  return allowed;
}

function extractRequestOrigin(request: NextRequest): string | null {
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }

  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * CSRF guard for cookie-authenticated mutating requests.
 * Returns true when request should be rejected.
 */
export function shouldRejectCsrf(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return false;
  }

  // Bearer-auth API clients are not vulnerable to browser CSRF by default.
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return false;
  }

  // Only enforce CSRF checks for cookie-authenticated requests.
  const cookieToken = request.cookies.get('token')?.value;
  if (!cookieToken) {
    return false;
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (
    secFetchSite &&
    !['same-origin', 'same-site', 'none'].includes(secFetchSite)
  ) {
    return true;
  }

  const requestOrigin = extractRequestOrigin(request);
  if (!requestOrigin) {
    return true;
  }

  return !getAllowedOrigins(request).has(requestOrigin);
}

export type SetAuthCookieOptions = {
  /**
   * Cookie Max-Age in seconds. Omit or `null` for a browser session cookie (clears when the browser session ends; behavior varies by OS/browser).
   * When set, should align with JWT `exp` from `generateToken`.
   */
  maxAgeSeconds?: number | null;
};

/** Default Max-Age when callers use `setAuthCookie` without options (register / magic links). */
const DEFAULT_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/**
 * Attach the auth cookie. Pair with {@link generateToken}: same effective lifetime as the JWT
 * (or use defaults for register/magic routes).
 */
export function setAuthCookie(response: NextResponse, token: string, options?: SetAuthCookieOptions): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  };
  if (options === undefined) {
    response.cookies.set('token', token, { ...base, maxAge: DEFAULT_COOKIE_MAX_AGE_SEC });
    return;
  }
  const maxAge = options.maxAgeSeconds;
  if (maxAge != null && maxAge > 0) {
    response.cookies.set('token', token, { ...base, maxAge });
  } else {
    response.cookies.set('token', token, base);
  }
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
