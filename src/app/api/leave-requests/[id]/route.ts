import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { emailService } from '@/lib/email';
import { UserModel } from '@/models/User';

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

    if (leaveRequest.teamId !== user.teamId) {
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
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
