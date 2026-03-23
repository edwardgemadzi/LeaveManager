import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, shouldRejectCsrf } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (shouldRejectCsrf(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
