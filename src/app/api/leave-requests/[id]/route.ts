import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { notifyLeaveDecision, notifyLeaveRemoved } from '@/services/notificationService';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { isLeaveEndOnOrAfterTodayInMemberZone } from '@/lib/leaveReminderPrefs';
import { teamIdsMatch } from '@/lib/helpers';
import { ObjectId } from 'mongodb';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { apiRateLimit } from '@/lib/rateLimit';
import { updateMemberPendingLeaveRequest } from '@/services/leaveRequestsService';

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

    const body = await request.json();
    const hasStatusField = Object.prototype.hasOwnProperty.call(body ?? {}, 'status');
    const status = body?.status;
    const decisionNote =
      typeof body?.decisionNote === 'string' ? body.decisionNote.trim() : '';

    const { id } = await params;

    if (!hasStatusField) {
      const updated = await updateMemberPendingLeaveRequest({
        user,
        requestId: id,
        body: {
          startDate: body?.startDate,
          endDate: body?.endDate,
          reason: body?.reason,
        },
      });
      if ('error' in updated) {
        return NextResponse.json(updated.error.body, { status: updated.error.status });
      }

      invalidateAnalyticsCache(user.teamId!);
      broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
        requestId: id,
        userId: user.id,
        updatedBy: user.id,
        updateType: 'member_edit',
      });

      return NextResponse.json({ success: true, request: updated.data });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (decisionNote.length > 500) {
      return NextResponse.json(
        { error: 'Decision note must be 500 characters or fewer' },
        { status: 400 }
      );
    }

    if (status === 'rejected' && decisionNote.length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }
    const leaveRequest = await LeaveRequestModel.findById(id);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delegated approvals are currently disabled; only leaders can approve/reject.
    if (user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const actorUser = await UserModel.findById(user.id);
    if (!actorUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await LeaveRequestModel.updateStatus(id, status, {
      note: decisionNote || undefined,
      byUserId: user.id,
      byUsername: actorUser.username,
    });

    // Get user details for audit and email
    const targetUser = await UserModel.findById(leaveRequest.userId);

    if (targetUser && actorUser) {
      // Log audit trail
      await AuditLogModel.logLeaveAction(
        status === 'approved' ? 'leave_approved' : 'leave_rejected',
        user.id,
        actorUser.username,
        'leader',
        user.teamId!,
        leaveRequest.userId,
        targetUser.username,
        id,
        {
          startDate: leaveRequest.startDate.toISOString().split('T')[0],
          endDate: leaveRequest.endDate.toISOString().split('T')[0],
          reason: leaveRequest.reason,
          decisionNote: decisionNote || undefined,
        },
      );

      await notifyLeaveDecision({
        leaveRequest,
        member: targetUser,
        status,
        decisionNote: decisionNote || undefined,
        leaderUsername: actorUser.username,
      });
    }

    // Broadcast event after status change
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
      requestId: id,
      userId: leaveRequest.userId,
      newStatus: status,
      updatedBy: user.id,
      decisionNote: decisionNote || undefined,
      decisionAt: new Date().toISOString(),
      decisionByUsername: actorUser.username,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Update leave request error:', error);
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

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid request ID format' }, { status: 400 });
    }
    
    const leaveRequest = await LeaveRequestModel.findById(id);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify team access
    if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Members can only delete their own pending requests
    // Leaders can delete any approved request
    if (user.role === 'member') {
      const requestOwnerId = String(leaveRequest.userId).trim();
      const currentUserId = String(user.id).trim();

      if (requestOwnerId !== currentUserId) {
        return NextResponse.json(
          { error: 'You can only delete your own requests' },
          { status: 403 }
        );
      }
      if (leaveRequest.status !== 'pending') {
        return NextResponse.json(
          { error: 'You can only delete pending requests' },
          { status: 403 }
        );
      }
    } else if (user.role === 'leader') {
      // Leaders can only delete approved requests
      if (leaveRequest.status !== 'approved') {
        return NextResponse.json(
          { error: 'Leaders can only delete approved requests' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete the request
    const deleted = await LeaveRequestModel.delete(id, user.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete request' },
        { status: 500 }
      );
    }

    // Get user details for audit
    const targetUser = await UserModel.findById(leaveRequest.userId);
    const actorUser = await UserModel.findById(user.id);

    if (targetUser && actorUser) {
      // Log audit trail
      await AuditLogModel.logLeaveAction(
        'leave_deleted',
        user.id,
        actorUser.username,
        user.role,
        user.teamId!,
        leaveRequest.userId,
        targetUser.username,
        id,
        {
          startDate: leaveRequest.startDate.toISOString().split('T')[0],
          endDate: leaveRequest.endDate.toISOString().split('T')[0],
          reason: leaveRequest.reason,
          status: leaveRequest.status,
        }
      );

      const stillRelevant = isLeaveEndOnOrAfterTodayInMemberZone(
        leaveRequest,
        new Date(),
        targetUser.timezone
      );
      if (stillRelevant) {
        const team = await TeamModel.findById(String(leaveRequest.teamId));
        const leader =
          team?.leaderId != null
            ? await UserModel.findById(String(team.leaderId))
            : null;
        const teamName = team?.name || 'Your team';
        const kind =
          user.role === 'member'
            ? 'member_withdrew_pending'
            : 'leader_removed_approved';
        await notifyLeaveRemoved({
          leaveRequest,
          member: targetUser,
          leader,
          actor: actorUser,
          teamName,
          kind,
        });
      }
    }

    // Broadcast event after deletion
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveRequestDeleted', {
      requestId: id,
      userId: leaveRequest.userId,
      deletedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Delete leave request error:', error);
    return internalServerError();
  }
}
