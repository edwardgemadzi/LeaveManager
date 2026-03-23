import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getLeaveDateConstraints } from '@/services/leaveRequestsService';
import { internalServerError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';
import { apiRateLimit } from '@/lib/rateLimit';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const from = request.nextUrl.searchParams.get('from') || '';
    const to = request.nextUrl.searchParams.get('to') || '';
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
    }

    const result = await getLeaveDateConstraints({ user, from, to });
    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    logError('Get leave constraints error:', error);
    return internalServerError();
  }
}
