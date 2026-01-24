import { NextRequest, NextResponse } from 'next/server';
import { forbiddenError } from '@/lib/errors';

/**
 * Check if the request is from localhost
 * Pure localhost detection without any environment variable checks
 * @param request - Next.js request object
 * @returns true if request is from localhost, false otherwise
 */
export function isLocalhost(request: NextRequest): boolean {
  // Check request URL
  const url = request.url;
  const isLocalhostUrl = 
    url.includes('localhost') || 
    url.includes('127.0.0.1') ||
    url.includes('::1');

  // Check headers
  const hostname = request.headers.get('host') || '';
  const forwardedHost = request.headers.get('x-forwarded-host') || '';
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             request.headers.get('x-real-ip') || 
             'unknown';

  // Check if request is from localhost via multiple methods
  const isLocal = 
    isLocalhostUrl ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('localhost:') ||
    hostname.startsWith('127.0.0.1:') ||
    forwardedHost === 'localhost' ||
    forwardedHost === '127.0.0.1' ||
    forwardedHost.startsWith('localhost:') ||
    forwardedHost.startsWith('127.0.0.1:') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    referer.includes('localhost') ||
    referer.includes('127.0.0.1') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost';

  // In development mode, be more lenient
  if (process.env.NODE_ENV === 'development' && !isLocal) {
    // Allow if no hostname is set (client-side fetch in dev)
    if (!hostname && !forwardedHost) {
      console.log('[Localhost] Development mode: Allowing request without hostname');
      return true;
    }
  }

  if (!isLocal) {
    console.log('[Localhost] Request rejected - not localhost', {
      url,
      hostname,
      forwardedHost,
      origin,
      referer,
      ip,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  return isLocal;
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
    console.log('[Localhost] Access denied: Request is not from localhost');
    return forbiddenError('This endpoint is only available on localhost. Make sure you are accessing via http://localhost:3000');
  }

  return null;
}

