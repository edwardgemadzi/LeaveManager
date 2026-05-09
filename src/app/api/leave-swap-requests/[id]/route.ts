import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { apiRateLimit } from '@/lib/rateLimit';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { AuditLogModel } from '@/models/AuditLog';
import { UserModel } from '@/models/User';
import { cancelLeaveSwapRequest, decideLeaveSwapRequest } from '@/services/leaveSwapRequestsService';
import { notifyLeaveSwapDecision } from '@/services/notificationService';
import { LeaveSwapRequestModel } from '@/models/LeaveSwapRequest';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    let body: { status?: string; decisionNote?: string };
    try {
      body = (await request.json()) as { status?: string; decisionNote?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const status = body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });
    }

    const result = await decideLeaveSwapRequest({
      user,
      swapId: id,
      status,
      decisionNote: body.decisionNote,
    });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    const swap = result.data;
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveSwapRequestUpdated', {
      swapId: id,
      action: swap.status,
    });
    broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
      requestId: swap.leaveRequestId,
      userId: swap.userId,
      updateType: 'swap_decision',
    });

    const actor = await UserModel.findById(user.id);
    const member = await UserModel.findById(swap.userId);
    if (actor && member) {
      await AuditLogModel.create({
        action: swap.status === 'approved' ? 'leave_swap_approved' : 'leave_swap_rejected',
        userId: user.id,
        userName: actor.username,
        userRole: 'leader',
        teamId: user.teamId!,
        targetUserId: swap.userId,
        targetUserName: member.username,
        details: {
          swapId: swap._id,
          leaveRequestId: swap.leaveRequestId,
          decisionNote: swap.decisionNote,
        },
      });

      await notifyLeaveSwapDecision({
        swap,
        member,
        status: swap.status === 'approved' ? 'approved' : 'rejected',
        decisionNote: swap.decisionNote,
        leaderUsername: actor.username,
      });
    }

    return NextResponse.json({ success: true, swap });
  } catch (error) {
    logError('Patch leave swap request error:', error);
    return internalServerError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const swapBefore = await LeaveSwapRequestModel.findById(id);
    const result = await cancelLeaveSwapRequest({ user, swapId: id });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    if (user.teamId && swapBefore) {
      invalidateAnalyticsCache(user.teamId);
      broadcastTeamUpdate(user.teamId, 'leaveSwapRequestUpdated', {
        swapId: id,
        userId: user.id,
        action: 'cancelled',
      });

      const actor = await UserModel.findById(user.id);
      if (actor) {
        await AuditLogModel.create({
          action: 'leave_swap_cancelled',
          userId: user.id,
          userName: actor.username,
          userRole: 'member',
          teamId: user.teamId,
          details: { swapId: id },
        });
      }
    }

    return NextResponse.json({ success: true, ...result.data });
  } catch (error) {
    logError('Delete leave swap request error:', error);
    return internalServerError();
  }
}
