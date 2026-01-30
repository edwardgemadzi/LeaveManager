import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { emailService } from '@/lib/email';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { ObjectId } from 'mongodb';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

export async function PATCH(
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

    const { status } = await request.json();
    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const leaveRequest = await LeaveRequestModel.findById(id);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await LeaveRequestModel.updateStatus(id, status);

    // Get user details for audit and email
    const targetUser = await UserModel.findById(leaveRequest.userId);
    const actorUser = await UserModel.findById(user.id);

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
        }
      );

      // Send email notification (placeholder - would need actual email addresses)
      if (status === 'approved') {
        await emailService.sendLeaveApprovalNotification(
          `${targetUser.username}@company.com`, // Placeholder email
          targetUser.username,
          leaveRequest.startDate.toISOString().split('T')[0],
          leaveRequest.endDate.toISOString().split('T')[0],
          leaveRequest.reason
        );
      } else {
        await emailService.sendLeaveRejectionNotification(
          `${targetUser.username}@company.com`, // Placeholder email
          targetUser.username,
          leaveRequest.startDate.toISOString().split('T')[0],
          leaveRequest.endDate.toISOString().split('T')[0],
          leaveRequest.reason
        );
      }
    }

    // Broadcast event after status change
    broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
      requestId: id,
      userId: leaveRequest.userId,
      newStatus: status,
      updatedBy: user.id,
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
      if (leaveRequest.userId !== user.id) {
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
    }

    // Broadcast event after deletion
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
