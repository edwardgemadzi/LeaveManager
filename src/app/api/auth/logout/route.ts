import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, shouldRejectCsrf } from '@/lib/auth';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

export async function POST(request: NextRequest) {
  if (shouldRejectCsrf(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403, headers: NO_STORE_JSON_HEADERS }
    );
  }
  const response = NextResponse.json({ success: true }, { headers: NO_STORE_JSON_HEADERS });
  clearAuthCookie(response);
  return response;
}
