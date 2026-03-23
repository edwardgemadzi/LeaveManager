import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { getAnalytics, type AuthedUserWithTeam } from '@/services/analyticsService';

// Disable caching for this API route to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
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

    // Get year parameter (defaults to current year)
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const targetYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();
    
    // Validate year (reasonable range: 2020-2100)
    if (isNaN(targetYear) || targetYear < 2020 || targetYear > 2100) {
      return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
    }
    return getAnalytics({
      user: user as AuthedUserWithTeam,
      targetYear,
    });
  } catch (error) {
    logError('Analytics API error:', error);
    return internalServerError();
  }
}

