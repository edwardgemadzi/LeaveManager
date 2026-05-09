import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { apiRateLimit } from '@/lib/rateLimit';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { previewLeaveSwap } from '@/services/leaveSwapRequestsService';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (shouldRejectCsrf(request)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const result = await previewLeaveSwap({
      user,
      body: body as Parameters<typeof previewLeaveSwap>[0]['body'],
    });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    logError('Preview leave swap error:', error);
    return internalServerError();
  }
}
