import { NextRequest, NextResponse } from 'next/server';
import { forbiddenError } from '@/lib/errors';

/**
 * Check if the request is from localhost
 * Restrictive check intended for development-only endpoints.
 * @param request - Next.js request object
 * @returns true if request is from localhost, false otherwise
 */
export function isLocalhost(request: NextRequest): boolean {
  // Never trust localhost checks outside development.
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  const hostname = request.nextUrl.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Require localhost access with optional environment variable check
 * Returns error response if not localhost or env var not enabled
 * 
 * @param request - Next.js request object
 * @param envVar - Optional environment variable name to check (e.g., 'ADMIN_ENABLED')
 * @returns null if authorized, or NextResponse error if not
 */
export function requireLocalhost(request: NextRequest, envVar?: string): NextResponse | null {
  // Check environment variable if provided
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue !== 'true') {
      console.log(`[Localhost] Access denied: ${envVar} is not set to "true"`);
      return forbiddenError(`${envVar} is disabled. Set ${envVar}=true in .env.local`);
    }
  }

  // Check if request is from localhost
  if (!isLocalhost(request)) {
    return forbiddenError('This endpoint is only available from localhost in development mode.');
  }

  return null;
}

