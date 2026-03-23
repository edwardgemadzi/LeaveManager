import { getMemberAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { AuthUser, LeaveRequest } from '@/types';

type DashboardHeaders = Record<string, string>;

export type DashboardServiceResponse = {
  status: number;
  body: Record<string, unknown>;
  headers?: DashboardHeaders;
};

type GetDashboardParams = {
  user: AuthUser;
  includeParam: string | null;
  membersModeParam: string | null;
  requestFieldsParam: string | null;
};

export async function getDashboard(params: GetDashboardParams): Promise<DashboardServiceResponse> {
  const { user, includeParam, membersModeParam, requestFieldsParam } = params;

  if (!user.teamId) {
    return { status: 400, body: { error: 'No team assigned' } };
  }

  const include = new Set(
    (includeParam || 'team,currentUser,members,requests,analytics')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );
  const membersMode = membersModeParam || 'full';
  const allowedRequestFields = new Set([
    '_id',
    'userId',
    'teamId',
    'startDate',
    'endDate',
    'reason',
    'status',
    'requestedBy',
    'decisionNote',
    'decisionAt',
    'decisionBy',
    'decisionByUsername',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'deletedBy',
  ]);
  const requestFields = requestFieldsParam
    ? requestFieldsParam
        .split(',')
        .map(field => field.trim())
        .filter(field => allowedRequestFields.has(field))
    : null;
  const pickRequestFields = (req: LeaveRequest) => {
    if (!requestFields || requestFields.length === 0) return req;
    const picked: Partial<LeaveRequest> = {};
    requestFields.forEach(field => {
      if (field in req) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (picked as any)[field] = (req as any)[field];
      }
    });
    return picked;
  };

  const includeAnalytics = include.has('analytics');
  const includeMembers = include.has('members') || includeAnalytics;
  const includeRequests = include.has('requests') || includeAnalytics;
  const includeCurrentUser = include.has('currentUser') || includeAnalytics;

  const [team, members, allRequests] = await Promise.all([
    TeamModel.findById(user.teamId),
    includeMembers ? UserModel.findByTeamId(user.teamId) : Promise.resolve([]),
    includeRequests ? LeaveRequestModel.findByTeamId(user.teamId) : Promise.resolve([]),
  ]);

  if (!team) {
    return { status: 404, body: { error: 'Team not found' } };
  }

  const currentUser = includeCurrentUser ? await UserModel.findById(user.id) : null;
  if (includeCurrentUser && !currentUser) {
    return { status: 404, body: { error: 'User not found' } };
  }

  const scopedRequests =
    user.role === 'leader'
      ? allRequests
      : allRequests.filter(req => String(req.userId) === String(user.id));

  let analytics: unknown;
  if (includeAnalytics && user.role === 'member' && currentUser) {
    const memberList = members.filter(m => m.role === 'member');
    const groupedAnalytics = getGroupedTeamAnalytics(memberList, team, allRequests);

    let memberAnalytics = null;
    for (const group of groupedAnalytics.groups) {
      const memberInGroup = group.members.find(m => String(m.userId) === String(user.id));
      if (memberInGroup) {
        memberAnalytics = memberInGroup.analytics;
        break;
      }
    }

    if (!memberAnalytics) {
      const memberRequests = allRequests.filter(
        req => String(req.userId) === String(user.id) && req.status === 'approved'
      );
      const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
      memberAnalytics = getMemberAnalytics(
        currentUser,
        team,
        memberRequests,
        allApprovedRequests,
        memberList
      );
    }

    analytics = memberAnalytics;
  } else if (includeAnalytics && user.role === 'leader') {
    analytics = getGroupedTeamAnalytics(members, team, allRequests);
  } else if (includeAnalytics) {
    return { status: 400, body: { error: 'Invalid role' } };
  }

  const isLeader = user.role === 'leader';

  const body = {
    ...(include.has('team') ? { team } : {}),
    ...(includeCurrentUser
      ? {
          currentUser: currentUser
            ? {
                _id: currentUser._id,
                username: currentUser.username,
                fullName: currentUser.fullName,
                role: currentUser.role,
                shiftSchedule: currentUser.shiftSchedule,
                shiftHistory: currentUser.shiftHistory,
                shiftTag: currentUser.shiftTag,
                workingDaysTag: currentUser.workingDaysTag,
                subgroupTag: currentUser.subgroupTag,
                manualLeaveBalance: currentUser.manualLeaveBalance,
                manualYearToDateUsed: currentUser.manualYearToDateUsed,
                manualYearToDateUsedYear: currentUser.manualYearToDateUsedYear,
                manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
                manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
                maternityPaternityType: currentUser.maternityPaternityType,
                carryoverFromPreviousYear: currentUser.carryoverFromPreviousYear,
                carryoverExpiryDate: currentUser.carryoverExpiryDate,
              }
            : null,
        }
      : {}),
    ...(includeMembers
      ? {
          members: members.map(member => {
            const baseMember = {
              _id: member._id,
              username: member.username,
              fullName: member.fullName,
              role: member.role,
              shiftSchedule: member.shiftSchedule,
              shiftHistory: membersMode === 'full' ? member.shiftHistory : undefined,
              shiftTag: member.shiftTag,
              workingDaysTag: member.workingDaysTag,
              subgroupTag: member.subgroupTag,
              createdAt: member.createdAt,
            };

            if (membersMode === 'full' && (isLeader || String(member._id) === String(user.id))) {
              return {
                ...baseMember,
                manualLeaveBalance: member.manualLeaveBalance,
                manualYearToDateUsed: member.manualYearToDateUsed,
                manualYearToDateUsedYear: member.manualYearToDateUsedYear,
                manualMaternityLeaveBalance: member.manualMaternityLeaveBalance,
                manualMaternityYearToDateUsed: member.manualMaternityYearToDateUsed,
                maternityPaternityType: member.maternityPaternityType,
              };
            }

            return baseMember;
          }),
        }
      : {}),
    ...(includeRequests
      ? {
          requests: requestFields
            ? scopedRequests.map(req => pickRequestFields(req))
            : scopedRequests,
        }
      : {}),
    ...(includeAnalytics ? { analytics: user.role === 'leader' ? analytics : { analytics } } : {}),
  };

  return {
    status: 200,
    body,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  };
}
