import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { emailService } from '@/lib/email';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, forbiddenError, badRequestError } from '@/lib/errors';

interface BulkActionRequest {
  action: 'approve' | 'reject';
  requestIds: string[];
  reason?: string; // For rejections
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return forbiddenError();
    }

    const body: BulkActionRequest = await request.json();
    const { action, requestIds, reason } = body;

    if (!action || !requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return badRequestError('Action and request IDs are required');
    }

    if (!['approve', 'reject'].includes(action)) {
      return badRequestError('Invalid action. Must be approve or reject');
    }

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Process each request
    for (const requestId of requestIds) {
      try {
        const leaveRequest = await LeaveRequestModel.findById(requestId);
        
        if (!leaveRequest) {
          results.failed.push({ id: requestId, error: 'Request not found' });
          continue;
        }

        if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
          results.failed.push({ id: requestId, error: 'Forbidden' });
          continue;
        }

        if (leaveRequest.status !== 'pending') {
          results.failed.push({ id: requestId, error: 'Request is not pending' });
          continue;
        }

        // Update the request status
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        await LeaveRequestModel.updateStatus(requestId, newStatus);

        // Get user details for audit and email
        const targetUser = await UserModel.findById(leaveRequest.userId);
        const actorUser = await UserModel.findById(user.id);

        if (targetUser && actorUser) {
          // Log audit trail
          await AuditLogModel.logLeaveAction(
            newStatus === 'approved' ? 'leave_approved' : 'leave_rejected',
            user.id,
            actorUser.username,
            'leader',
            user.teamId!,
            leaveRequest.userId,
            targetUser.username,
            requestId,
            {
              startDate: leaveRequest.startDate.toISOString().split('T')[0],
              endDate: leaveRequest.endDate.toISOString().split('T')[0],
              reason: leaveRequest.reason,
            },
            { bulkAction: true, reason }
          );

          // Send email notification (placeholder - would need actual email addresses)
          if (action === 'approve') {
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
              leaveRequest.reason,
              reason
            );
          }
        }

        results.successful.push(requestId);
      } catch (error) {
        logError(`Error processing request ${requestId}:`, error);
        results.failed.push({ 
          id: requestId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    if (results.successful.length > 0) {
      invalidateAnalyticsCache(user.teamId!);
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: requestIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    logError('Bulk action error:', error);
    return internalServerError();
  }
}
