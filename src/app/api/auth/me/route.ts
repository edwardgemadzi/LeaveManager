import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { authMeRateLimit } from '@/lib/rateLimit';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

/**
 * Returns the current session from the HTTP-only auth cookie (no DB hit).
 * Rate-limited and non-cacheable to reduce abuse and shared-cache leakage.
 */
export async function GET(request: NextRequest) {
  const limited = authMeRateLimit(request);
  if (limited) {
    return limited;
  }

  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_JSON_HEADERS }
    );
  }

  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401, headers: NO_STORE_JSON_HEADERS }
    );
  }

  return NextResponse.json(
    {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        accessRole: user.accessRole || user.role,
        teamId: user.teamId,
      },
    },
    { headers: NO_STORE_JSON_HEADERS }
  );
}
