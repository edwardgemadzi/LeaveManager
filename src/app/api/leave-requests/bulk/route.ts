import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { notifyLeaveDecision } from '@/services/notificationService';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, forbiddenError, badRequestError } from '@/lib/errors';
import { apiRateLimit } from '@/lib/rateLimit';
import { ObjectId } from 'mongodb';
import { broadcastTeamUpdate } from '@/lib/teamEvents';

interface BulkActionRequest {
  action: 'approve' | 'reject';
  requestIds: string[];
  decisionNote?: string;
}

export async function PATCH(request: NextRequest) {
  try {
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (shouldRejectCsrf(request)) {
      return forbiddenError('Invalid request origin');
    }

    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return forbiddenError();
    }

    const body: BulkActionRequest = await request.json();
    const { action, requestIds, decisionNote } = body;
    const normalizedDecisionNote =
      typeof decisionNote === 'string' ? decisionNote.trim() : '';

    if (!action || !requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return badRequestError('Action and request IDs are required');
    }

    if (!['approve', 'reject'].includes(action)) {
      return badRequestError('Invalid action. Must be approve or reject');
    }

    if (requestIds.length > 100) {
      return badRequestError('A maximum of 100 requests can be processed at once');
    }

    const dedupedRequestIds = [...new Set(requestIds.map(id => String(id).trim()))];
    if (dedupedRequestIds.some(id => !ObjectId.isValid(id))) {
      return badRequestError('All request IDs must be valid');
    }

    if (normalizedDecisionNote.length > 500) {
      return badRequestError('Decision note must be 500 characters or fewer');
    }

    if (action === 'reject' && normalizedDecisionNote.length === 0) {
      return badRequestError('Rejection reason is required for bulk rejection');
    }

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Process each request
    for (const requestId of dedupedRequestIds) {
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
        const actorUser = await UserModel.findById(user.id);
        if (!actorUser) {
          results.failed.push({ id: requestId, error: 'User not found' });
          continue;
        }

        await LeaveRequestModel.updateStatus(requestId, newStatus, {
          note: normalizedDecisionNote || undefined,
          byUserId: user.id,
          byUsername: actorUser.username,
        });

        // Get user details for audit and email
        const targetUser = await UserModel.findById(leaveRequest.userId);

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
              decisionNote: normalizedDecisionNote || undefined,
            },
            { bulkAction: true, reason: normalizedDecisionNote || undefined }
          );

          await notifyLeaveDecision({
            leaveRequest,
            member: targetUser,
            status: newStatus,
            decisionNote: normalizedDecisionNote || undefined,
            leaderUsername: actorUser.username,
          });
        }

        results.successful.push(requestId);
      } catch (error) {
        logError(`Error processing request ${requestId}:`, error);
        results.failed.push({ 
          id: requestId, 
          error: 'Failed to process request' 
        });
      }
    }

    if (results.successful.length > 0) {
      invalidateAnalyticsCache(user.teamId!);
      broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
        updateType: 'bulk_review',
        requestIds: results.successful,
        updatedBy: user.id,
      });
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: dedupedRequestIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    logError('Bulk action error:', error);
    return internalServerError();
  }
}
