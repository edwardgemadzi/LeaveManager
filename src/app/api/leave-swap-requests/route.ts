import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { apiRateLimit } from '@/lib/rateLimit';
import { error as logError, info } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { AuditLogModel } from '@/models/AuditLog';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { createLeaveSwapRequest, getLeaveSwapRequests } from '@/services/leaveSwapRequestsService';
import { notifyLeaveSwapSubmitted } from '@/services/notificationService';

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

    const { searchParams } = request.nextUrl;
    const result = await getLeaveSwapRequests({
      user,
      status: searchParams.get('status'),
    });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    logError('Get leave swap requests error:', error);
    return internalServerError();
  }
}

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

    const result = await createLeaveSwapRequest({
      user,
      body: body as Parameters<typeof createLeaveSwapRequest>[0]['body'],
    });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    const swap = result.data;
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveSwapRequestUpdated', {
      swapId: swap._id,
      userId: user.id,
      action: 'created',
    });

    const team = await TeamModel.findById(user.teamId!);
    const member = await UserModel.findById(user.id);
    if (team && member) {
      await AuditLogModel.create({
        action: 'leave_swap_created',
        userId: user.id,
        userName: member.username,
        userRole: 'member',
        teamId: user.teamId!,
        targetUserId: user.id,
        targetUserName: member.username,
        details: {
          swapId: swap._id,
          leaveRequestId: swap.leaveRequestId,
          sourceSubStart: swap.sourceSubStart,
          sourceSubEnd: swap.sourceSubEnd,
          targetStart: swap.targetStart,
          targetEnd: swap.targetEnd,
        },
      });

      await notifyLeaveSwapSubmitted({
        swap,
        member,
        teamName: team.name,
      });
    }

    info(`[LeaveSwap] Created swap ${swap._id} for team ${user.teamId}`);
    return NextResponse.json(swap, { status: 201 });
  } catch (error) {
    logError('Create leave swap request error:', error);
    return internalServerError();
  }
}
