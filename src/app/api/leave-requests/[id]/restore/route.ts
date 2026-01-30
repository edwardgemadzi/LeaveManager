import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { ObjectId } from 'mongodb';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid request ID format' }, { status: 400 });
    }

    const leaveRequest = await LeaveRequestModel.findById(id, true);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Verify team access
    if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!leaveRequest.deletedAt) {
      return NextResponse.json({ error: 'Request is not deleted' }, { status: 400 });
    }

    const restored = await LeaveRequestModel.restore(id);
    if (!restored) {
      return NextResponse.json(
        { error: 'Failed to restore request' },
        { status: 500 }
      );
    }

    // Audit log
    const targetUser = await UserModel.findById(leaveRequest.userId);
    const actorUser = await UserModel.findById(user.id);
    if (targetUser && actorUser) {
      await AuditLogModel.create({
        action: 'leave_updated',
        userId: user.id,
        userName: actorUser.username,
        userRole: user.role,
        teamId: user.teamId!,
        targetUserId: leaveRequest.userId,
        targetUserName: targetUser.username,
        details: {
          action: 'restore',
          leaveRequestId: id,
          startDate: leaveRequest.startDate.toISOString().split('T')[0],
          endDate: leaveRequest.endDate.toISOString().split('T')[0],
          reason: leaveRequest.reason,
          previousStatus: leaveRequest.status,
        },
      });
    }

    broadcastTeamUpdate(user.teamId!, 'leaveRequestRestored', {
      requestId: id,
      userId: leaveRequest.userId,
      restoredBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Restore leave request error:', error);
    return internalServerError();
  }
}

