import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';
import { UserModel } from '@/models/User';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { apiRateLimit } from '@/lib/rateLimit';
import { teamIdsMatch } from '@/lib/helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await apiRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (shouldRejectCsrf(request)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    const token = getTokenFromRequest(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    if (user.role !== 'member') {
      return NextResponse.json({ error: 'Only members can consent to requests' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = body?.action;

    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });
    }

    const leaveRequest = await LeaveRequestModel.findById(id, true);
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Must be the owner
    if (String(leaveRequest.userId) !== String(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!leaveRequest.requiresMemberConsent || leaveRequest.memberConsentStatus !== 'pending') {
      return NextResponse.json({ error: 'This request does not require consent' }, { status: 400 });
    }

    const consentAction = action === 'accept' ? 'accepted' : 'declined';
    await LeaveRequestModel.updateConsentStatus(id, consentAction);

    const actorUser = await UserModel.findById(user.id);

    if (actorUser) {
      await AuditLogModel.logLeaveAction(
        action === 'accept' ? 'leave_approved' : 'leave_rejected',
        user.id,
        actorUser.username,
        'member',
        user.teamId!,
        String(leaveRequest.userId),
        actorUser.username,
        id,
        {
          startDate: new Date(leaveRequest.startDate).toISOString().split('T')[0],
          endDate: new Date(leaveRequest.endDate).toISOString().split('T')[0],
          reason: leaveRequest.reason,
          decisionNote: `Member ${action === 'accept' ? 'accepted' : 'declined'} auto-scheduled leave`,
        },
      );
    }

    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'leaveRequestUpdated', {
      requestId: id,
      userId: leaveRequest.userId,
      newStatus: action === 'accept' ? 'approved' : 'rejected',
      updatedBy: user.id,
      memberConsentStatus: consentAction,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Consent leave request error:', error);
    return internalServerError();
  }
}
