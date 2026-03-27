import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { CreateLeaveRequest, CreateLeaveRequestBatch, LeaveRequest } from '@/types';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError, info } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { apiRateLimit } from '@/lib/rateLimit';
import {
  createLeaveRequest,
  createLeaveRequestBatch,
  getLeaveRequests,
} from '@/services/leaveRequestsService';
import { notifyLeaveSubmitted, notifyLeaveSubmittedBatch } from '@/services/notificationService';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { validateLeaveDatesAgainstTeamPolicy } from '@/lib/leaveDateRules';

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
    const result = await getLeaveRequests({
      user,
      statusParam: searchParams.get('status'),
      userIdParam: searchParams.get('userId'),
      fieldsParam: searchParams.get('fields'),
      includeDeletedParam: searchParams.get('includeDeleted'),
    });

    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    logError('Get leave requests error:', error);
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
    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    let body: CreateLeaveRequest | CreateLeaveRequestBatch;
    try {
      body = (await request.json()) as CreateLeaveRequest | CreateLeaveRequestBatch;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const hasSegments = Array.isArray((body as CreateLeaveRequestBatch).segments);
    const teamForValidation = user.teamId ? await TeamModel.findById(user.teamId) : null;
    if (hasSegments) {
      if (teamForValidation) {
        for (const segment of (body as CreateLeaveRequestBatch).segments) {
          const policyError = validateLeaveDatesAgainstTeamPolicy({
            settings: teamForValidation.settings,
            startDate: segment.startDate,
            endDate: segment.endDate,
          });
          if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
          }
        }
      }
      const batchResult = await createLeaveRequestBatch({
        user,
        body: body as CreateLeaveRequestBatch,
      });
      if ('error' in batchResult) {
        return NextResponse.json(batchResult.error.body, { status: batchResult.error.status });
      }

      const { createdRequests, failedSegments } = batchResult.data;
      invalidateAnalyticsCache(user.teamId!);
      for (const leaveRequest of createdRequests) {
        const eventData = {
          requestId: (leaveRequest._id || '').toString(),
          userId: leaveRequest.userId.toString(),
          startDate:
            leaveRequest.startDate instanceof Date
              ? leaveRequest.startDate.toISOString()
              : new Date(leaveRequest.startDate).toISOString(),
          endDate:
            leaveRequest.endDate instanceof Date
              ? leaveRequest.endDate.toISOString()
              : new Date(leaveRequest.endDate).toISOString(),
          reason: leaveRequest.reason,
          status: leaveRequest.status,
        };
        info(`[LeaveRequest] Broadcasting leaveRequestCreated event for team ${user.teamId}:`, eventData);
        broadcastTeamUpdate(user.teamId!, 'leaveRequestCreated', eventData);
      }

      const memberUser = await UserModel.findById(createdRequests[0].userId.toString());
      const team = await TeamModel.findById(user.teamId!);
      if (memberUser && team) {
        await notifyLeaveSubmittedBatch({
          leaveRequests: createdRequests,
          member: memberUser,
          teamName: team.name,
        });
      }

      return NextResponse.json({
        createdRequests,
        failedSegments: failedSegments.map((item) => ({
          segment: item.segment,
          status: item.error.status,
          error: item.error.body?.error || 'Failed to create segment',
        })),
      });
    }

    if (teamForValidation) {
      const policyError = validateLeaveDatesAgainstTeamPolicy({
        settings: teamForValidation.settings,
        startDate: (body as CreateLeaveRequest).startDate,
        endDate: (body as CreateLeaveRequest).endDate,
      });
      if (policyError) {
        return NextResponse.json({ error: policyError }, { status: 400 });
      }
    }

    const result = await createLeaveRequest({ user, body: body as CreateLeaveRequest });
    if ('error' in result) {
      return NextResponse.json(result.error.body, { status: result.error.status });
    }

    const leaveRequest: LeaveRequest = result.data;

    // Broadcast event after successful creation (outside transaction)
    // Serialize dates to ISO strings for JSON compatibility
    const eventData = {
      requestId: (leaveRequest._id || '').toString(),
      userId: leaveRequest.userId.toString(),
      startDate:
        leaveRequest.startDate instanceof Date
          ? leaveRequest.startDate.toISOString()
          : new Date(leaveRequest.startDate).toISOString(),
      endDate:
        leaveRequest.endDate instanceof Date
          ? leaveRequest.endDate.toISOString()
          : new Date(leaveRequest.endDate).toISOString(),
      reason: leaveRequest.reason,
      status: leaveRequest.status,
    };

    info(`[LeaveRequest] Broadcasting leaveRequestCreated event for team ${user.teamId}:`, eventData);
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveRequestCreated', eventData);

    const memberUser = await UserModel.findById(leaveRequest.userId.toString());
    const team = await TeamModel.findById(user.teamId!);
    if (memberUser && team) {
      await notifyLeaveSubmitted({
        leaveRequest,
        member: memberUser,
        teamName: team.name,
      });
    }

    return NextResponse.json(leaveRequest);
  } catch (error) {
    logError('Create leave request error:', error);
    return internalServerError();
  }
}
