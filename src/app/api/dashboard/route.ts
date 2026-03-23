import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDashboard } from '@/services/dashboardService';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

// Disable caching for this API route to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    const result = await getDashboard({
      user,
      includeParam: searchParams.get('include'),
      membersModeParam: searchParams.get('members'),
      requestFieldsParam: searchParams.get('requestFields'),
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    logError('Dashboard API error:', error);
    return internalServerError();
  }
}

