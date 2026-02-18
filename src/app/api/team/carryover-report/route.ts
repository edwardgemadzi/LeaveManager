import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { getMemberAnalytics } from '@/lib/analyticsCalculations';
import { unauthorizedError, forbiddenError, badRequestError, notFoundError } from '@/lib/errors';

/**
 * GET /api/team/carryover-report
 * Leader-only. Returns per-member carryover figures from DB and calculated values
 * so leaders can verify accuracy (e.g. Edward: carried over 5, used 4, remaining 1).
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return unauthorizedError();

    const user = verifyToken(token);
    if (!user) return unauthorizedError('Invalid token');
    if (!user.teamId) return badRequestError('No team assigned');
    if (user.role !== 'leader') return forbiddenError('Leaders only');

    const [team, members, allRequests] = await Promise.all([
      TeamModel.findById(user.teamId),
      UserModel.findByTeamId(user.teamId),
      LeaveRequestModel.findByTeamId(user.teamId),
    ]);

    if (!team) return notFoundError('Team not found');

    const allApproved = allRequests.filter((r) => r.status === 'approved');
    const memberList = members.filter((m) => m.role === 'member');

    const report: Array<{
      userId: string;
      fullName?: string;
      username: string;
      carryoverFromPreviousYear: number;
      carryoverExpiryDate: string | null;
      carryoverBalance: number;
      usedFromCarryover: number;
    }> = [];

    for (const member of memberList) {
      const memberRequests = allRequests.filter(
        (r) => String(r.userId) === String(member._id) && r.status === 'approved'
      );
      const analytics = getMemberAnalytics(
        member,
        team,
        memberRequests,
        allApproved,
        memberList
      );
      const carried = member.carryoverFromPreviousYear ?? 0;
      const remaining = analytics.carryoverBalance ?? 0;
      const used = analytics.carryoverDaysUsed ?? Math.max(0, carried - remaining);
      report.push({
        userId: String(member._id),
        fullName: member.fullName,
        username: member.username,
        carryoverFromPreviousYear: carried,
        carryoverExpiryDate: member.carryoverExpiryDate
          ? new Date(member.carryoverExpiryDate).toISOString()
          : null,
        carryoverBalance: Math.round(remaining),
        usedFromCarryover: Math.round(used),
      });
    }

    return NextResponse.json({
      teamId: String(team._id),
      teamName: team.name,
      members: report,
    });
  } catch (e) {
    console.error('[carryover-report]', e);
    return NextResponse.json(
      { error: 'Failed to generate carryover report' },
      { status: 500 }
    );
  }
}
