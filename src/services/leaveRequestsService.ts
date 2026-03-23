import { AuthUser, CreateLeaveRequest, LeaveRequest } from '@/types';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { isBypassNoticePeriodActive } from '@/lib/noticePeriod';
import { validateRequest, schemas } from '@/lib/validation';
import { getClient } from '@/lib/mongodb';
import { parseDateSafe } from '@/lib/dateUtils';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { teamIdsMatch } from '@/lib/helpers';

type ServiceError = {
  status: number;
  body: Record<string, unknown>;
};

type ServiceSuccess<T> = {
  data: T;
};

export type ServiceResult<T> = ServiceSuccess<T> | { error: ServiceError };

export type LeaveDateConstraintCode =
  | 'OK'
  | 'PAST_DATE'
  | 'NOTICE_PERIOD'
  | 'CAPACITY_FULL'
  | 'OWN_PENDING_OVERLAP'
  | 'NON_WORKING_DAY'
  | 'INVALID_DATE';

export type LeaveDateConstraintDay = {
  selectable: boolean;
  codes: LeaveDateConstraintCode[];
  message: string;
};

type GetLeaveRequestsParams = {
  user: AuthUser;
  statusParam: string | null;
  userIdParam: string | null;
  fieldsParam: string | null;
  includeDeletedParam: string | null;
};

export async function getLeaveRequests(
  params: GetLeaveRequestsParams
): Promise<ServiceResult<LeaveRequest[] | Partial<LeaveRequest>[]>> {
  const { user, statusParam, userIdParam, fieldsParam, includeDeletedParam } = params;

  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const allowedFields = new Set([
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
  const fields = fieldsParam
    ? fieldsParam
        .split(',')
        .map(field => field.trim())
        .filter(field => allowedFields.has(field))
    : null;

  if (fieldsParam && fields && fields.length === 0) {
    return {
      error: {
        status: 400,
        body: { error: 'No valid fields requested' },
      },
    };
  }

  const pickFields = (req: LeaveRequest) => {
    if (!fields || fields.length === 0) return req;
    const picked: Partial<LeaveRequest> = {};
    fields.forEach(field => {
      if (field in req) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (picked as any)[field] = (req as any)[field];
      }
    });
    return picked;
  };

  const statusFilter = statusParam
    ? new Set(statusParam.split(',').map(s => s.trim()).filter(Boolean))
    : null;

  const includeDeleted = includeDeletedParam === 'true' && user.role === 'leader';
  let requests = await LeaveRequestModel.findByTeamId(user.teamId, includeDeleted);

  if (user.role === 'member' && team.settings.enableSubgrouping) {
    const currentUser = await UserModel.findById(user.id);
    const userSubgroup = currentUser?.subgroupTag || 'Ungrouped';

    const teamMembers = await UserModel.findByTeamId(user.teamId);

    const userSubgroupMap = new Map<string, string>();
    teamMembers.forEach(member => {
      if (member._id) {
        const memberId = String(member._id).trim();
        const memberSubgroup = member.subgroupTag || 'Ungrouped';
        userSubgroupMap.set(memberId, memberSubgroup);
      }
    });

    const filteredRequests = requests.filter(req => {
      const reqUserId = String(req.userId).trim();
      const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
      return reqUserSubgroup === userSubgroup;
    });
    requests = filteredRequests;
  }

  if (statusFilter) {
    requests = requests.filter(req => statusFilter.has(req.status));
  }

  if (userIdParam) {
    const normalizedUserId = userIdParam.trim();
    requests = requests.filter(req => String(req.userId).trim() === normalizedUserId);
  }

  const response = fields ? requests.map(req => pickFields(req)) : requests;
  return { data: response };
}

export async function createLeaveRequest(params: {
  user: AuthUser;
  body: CreateLeaveRequest;
}): Promise<ServiceResult<LeaveRequest>> {
  const { user, body } = params;
  const { startDate, endDate, reason, requestedFor, isHistorical } = body;

  if (!isHistorical) {
    const validation = validateRequest(schemas.leaveRequest, { startDate, endDate, reason });
    if (!validation.isValid) {
      return {
        error: {
          status: 400,
          body: { error: 'Validation failed', details: validation.errors },
        },
      };
    }
  } else if (!startDate || !endDate || !reason) {
    return {
      error: {
        status: 400,
        body: { error: 'Start date, end date, and reason are required' },
      },
    };
  }

  if (isHistorical && user.role !== 'leader') {
    return {
      error: {
        status: 403,
        body: { error: 'Only leaders can create historical leave entries' },
      },
    };
  }

  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      error: {
        status: 400,
        body: { error: 'Start date and end date must be valid dates' },
      },
    };
  }

  if (start > end) {
    return {
      error: {
        status: 400,
        body: { error: 'End date must be on or after start date' },
      },
    };
  }

  if (requestedFor && user.role !== 'leader') {
    return {
      error: {
        status: 403,
        body: { error: 'Only leaders can create requests for other users' },
      },
    };
  }

  const requestUserId = requestedFor || user.id;

  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  if (requestedFor) {
    const targetUser = await UserModel.findById(requestedFor);
    if (!targetUser) {
      return { error: { status: 404, body: { error: 'Requested user not found' } } };
    }

    if (!teamIdsMatch(targetUser.teamId, user.teamId)) {
      return {
        error: {
          status: 403,
          body: { error: 'Requested user is not in your team' },
        },
      };
    }
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const requestUser = await UserModel.findById(requestUserId);
  if (!requestUser) {
    return { error: { status: 404, body: { error: 'Requesting user not found' } } };
  }
  if (!teamIdsMatch(requestUser.teamId, user.teamId)) {
    return {
      error: {
        status: 403,
        body: { error: 'Requested user is not in your team' },
      },
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestStartDate = new Date(start);
  requestStartDate.setHours(0, 0, 0, 0);

  const daysDifference = Math.ceil(
    (requestStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (!isHistorical) {
    const bypassActive = isBypassNoticePeriodActive(team, today);

    if (!bypassActive && daysDifference < team.settings.minimumNoticePeriod) {
      return {
        error: {
          status: 400,
          body: {
            error: `Leave requests must be submitted at least ${team.settings.minimumNoticePeriod} day(s) in advance. Please select a start date ${team.settings.minimumNoticePeriod} or more days from today.`,
          },
        },
      };
    }
  }

  const requestingUserShiftTag = requestUser?.shiftTag;
  const requestingUserSubgroupTag = requestUser?.subgroupTag;

  const teamMembers = await UserModel.findByTeamId(user.teamId);

  const userSubgroupMap = new Map<string, string>();
  const userShiftTagMap = new Map<string, string | undefined>();
  const userMap = new Map<string, (typeof teamMembers)[number]>();
  teamMembers.forEach(member => {
    if (member._id) {
      const memberId = String(member._id);
      userSubgroupMap.set(memberId, member.subgroupTag || 'Ungrouped');
      userShiftTagMap.set(memberId, member.shiftTag);
      userMap.set(memberId, member);
    }
  });

  if (requestUser?._id) {
    const normalizedRequestUserId = String(requestUser._id);
    userSubgroupMap.set(normalizedRequestUserId, requestingUserSubgroupTag || 'Ungrouped');
    userShiftTagMap.set(normalizedRequestUserId, requestingUserShiftTag);
    userMap.set(normalizedRequestUserId, requestUser);
  }

  let leaveRequest!: LeaveRequest;

  if (!isHistorical) {
    const client = await getClient();
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        const pendingOverlaps =
          await LeaveRequestModel.findPendingOverlappingRequestsForUser(
            requestUserId,
            start,
            end,
            undefined,
            session
          );
        if (pendingOverlaps.length > 0) {
          throw new Error(
            'DUPLICATE_PENDING_REQUEST: You already have a pending leave request for one or more of the selected dates.'
          );
        }

        const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
          user.teamId!,
          start,
          end,
          undefined,
          session
        );

        const requestStartDateTx = new Date(start);
        requestStartDateTx.setHours(0, 0, 0, 0);
        const requestEndDateTx = new Date(end);
        requestEndDateTx.setHours(0, 0, 0, 0);

        let exceedsConcurrentLimit = false;
        for (
          let checkDate = new Date(requestStartDateTx);
          checkDate <= requestEndDateTx;
          checkDate.setDate(checkDate.getDate() + 1)
        ) {
          if (!isWorkingDay(checkDate, requestUser)) {
            continue;
          }

          let relevantOverlappingCount = 0;
          for (const req of overlappingRequests) {
            const reqStart = parseDateSafe(req.startDate);
            const reqEnd = parseDateSafe(req.endDate);
            reqStart.setHours(0, 0, 0, 0);
            reqEnd.setHours(23, 59, 59, 999);

            if (checkDate < reqStart || checkDate > reqEnd) {
              continue;
            }

            const reqUserId = String(req.userId);
            const reqUser = userMap.get(reqUserId);
            if (!reqUser) {
              relevantOverlappingCount++;
              continue;
            }

            if (!isWorkingDay(checkDate, reqUser)) {
              continue;
            }

            if (team.settings.enableSubgrouping) {
              const requestingSubgroup = requestingUserSubgroupTag || 'Ungrouped';
              const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
              if (requestingSubgroup !== reqUserSubgroup) continue;
            }

            if (requestingUserShiftTag !== undefined) {
              const reqUserShiftTag = userShiftTagMap.get(reqUserId);
              if (reqUserShiftTag !== requestingUserShiftTag) continue;
            } else {
              const reqUserShiftTag = userShiftTagMap.get(reqUserId);
              if (reqUserShiftTag !== undefined) continue;
            }

            relevantOverlappingCount++;
          }

          if (relevantOverlappingCount >= team.settings.concurrentLeave) {
            exceedsConcurrentLimit = true;
            break;
          }
        }

        if (exceedsConcurrentLimit) {
          let context = '';
          if (team.settings.enableSubgrouping && requestingUserSubgroupTag) {
            context = ` (${requestingUserSubgroupTag} subgroup)`;
          } else if (team.settings.enableSubgrouping && !requestingUserSubgroupTag) {
            context = ' (Ungrouped)';
          } else if (requestingUserShiftTag) {
            context = ` (${requestingUserShiftTag} shift)`;
          }
          throw new Error(
            `SLOT_UNAVAILABLE: Concurrent leave limit exceeded${context}. Maximum ${team.settings.concurrentLeave} team member(s) can be on leave simultaneously.`
          );
        }

        leaveRequest = await LeaveRequestModel.create(
          {
            userId: requestUserId,
            teamId: user.teamId!,
            startDate: start,
            endDate: end,
            reason,
            status: 'pending',
            requestedBy: requestedFor ? user.id : undefined,
          },
          session
        );
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('DUPLICATE_PENDING_REQUEST:')
      ) {
        return {
          error: {
            status: 409,
            body: {
              error: error.message.replace('DUPLICATE_PENDING_REQUEST: ', ''),
            },
          },
        };
      }

      if (error instanceof Error && error.message.startsWith('SLOT_UNAVAILABLE:')) {
        return {
          error: {
            status: 409,
            body: {
              error: 'This time slot is no longer available. Please select different dates.',
              details: error.message.replace('SLOT_UNAVAILABLE: ', ''),
            },
          },
        };
      }

      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    leaveRequest = await LeaveRequestModel.create({
      userId: requestUserId,
      teamId: user.teamId!,
      startDate: start,
      endDate: end,
      reason,
      status: 'approved',
      requestedBy: requestedFor ? user.id : undefined,
    });
  }

  return { data: leaveRequest };
}

export async function updateMemberPendingLeaveRequest(params: {
  user: AuthUser;
  requestId: string;
  body: Pick<CreateLeaveRequest, 'startDate' | 'endDate' | 'reason'>;
}): Promise<ServiceResult<LeaveRequest>> {
  const { user, requestId, body } = params;
  const { startDate, endDate, reason } = body;

  if (user.role !== 'member') {
    return { error: { status: 403, body: { error: 'Only members can edit pending requests' } } };
  }

  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const validation = validateRequest(schemas.leaveRequest, { startDate, endDate, reason });
  if (!validation.isValid) {
    return {
      error: {
        status: 400,
        body: { error: 'Validation failed', details: validation.errors },
      },
    };
  }

  const leaveRequest = await LeaveRequestModel.findById(requestId);
  if (!leaveRequest) {
    return { error: { status: 404, body: { error: 'Request not found' } } };
  }

  if (!teamIdsMatch(leaveRequest.teamId, user.teamId)) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  if (String(leaveRequest.userId).trim() !== String(user.id).trim()) {
    return { error: { status: 403, body: { error: 'You can only edit your own requests' } } };
  }

  if (leaveRequest.status !== 'pending') {
    return { error: { status: 403, body: { error: 'Only pending requests can be edited' } } };
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const requestUser = await UserModel.findById(user.id);
  if (!requestUser) {
    return { error: { status: 404, body: { error: 'User not found' } } };
  }

  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: { status: 400, body: { error: 'Start date and end date must be valid dates' } } };
  }
  if (start > end) {
    return { error: { status: 400, body: { error: 'End date must be on or after start date' } } };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestStartDate = new Date(start);
  requestStartDate.setHours(0, 0, 0, 0);
  const daysDifference = Math.ceil(
    (requestStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const bypassActive = isBypassNoticePeriodActive(team, today);
  if (!bypassActive && daysDifference < team.settings.minimumNoticePeriod) {
    return {
      error: {
        status: 400,
        body: {
          error: `Leave requests must be submitted at least ${team.settings.minimumNoticePeriod} day(s) in advance.`,
        },
      },
    };
  }

  const pendingOverlaps = await LeaveRequestModel.findPendingOverlappingRequestsForUser(
    user.id,
    start,
    end,
    requestId
  );
  if (pendingOverlaps.length > 0) {
    return {
      error: {
        status: 409,
        body: {
          error: 'You already have another pending leave request for one or more of these dates.',
        },
      },
    };
  }

  const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
    user.teamId,
    start,
    end,
    requestId
  );

  const teamMembers = await UserModel.findByTeamId(user.teamId);
  const userSubgroupMap = new Map<string, string>();
  const userShiftTagMap = new Map<string, string | undefined>();
  const userMap = new Map<string, (typeof teamMembers)[number]>();
  teamMembers.forEach(member => {
    if (member._id) {
      const memberId = String(member._id);
      userSubgroupMap.set(memberId, member.subgroupTag || 'Ungrouped');
      userShiftTagMap.set(memberId, member.shiftTag);
      userMap.set(memberId, member);
    }
  });

  const requestStartDateTx = new Date(start);
  requestStartDateTx.setHours(0, 0, 0, 0);
  const requestEndDateTx = new Date(end);
  requestEndDateTx.setHours(0, 0, 0, 0);

  let exceedsConcurrentLimit = false;
  for (
    let checkDate = new Date(requestStartDateTx);
    checkDate <= requestEndDateTx;
    checkDate.setDate(checkDate.getDate() + 1)
  ) {
    if (!isWorkingDay(checkDate, requestUser)) {
      continue;
    }

    let relevantOverlappingCount = 0;
    for (const req of overlappingRequests) {
      const reqStart = parseDateSafe(req.startDate);
      const reqEnd = parseDateSafe(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);

      if (checkDate < reqStart || checkDate > reqEnd) {
        continue;
      }

      const reqUserId = String(req.userId);
      const reqUser = userMap.get(reqUserId);
      if (!reqUser) {
        relevantOverlappingCount++;
        continue;
      }

      if (!isWorkingDay(checkDate, reqUser)) {
        continue;
      }

      if (team.settings.enableSubgrouping) {
        const requestingSubgroup = requestUser.subgroupTag || 'Ungrouped';
        const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
        if (requestingSubgroup !== reqUserSubgroup) continue;
      }

      if (requestUser.shiftTag !== undefined) {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== requestUser.shiftTag) continue;
      } else {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== undefined) continue;
      }

      relevantOverlappingCount++;
    }

    if (relevantOverlappingCount >= team.settings.concurrentLeave) {
      exceedsConcurrentLimit = true;
      break;
    }
  }

  if (exceedsConcurrentLimit) {
    return {
      error: {
        status: 409,
        body: {
          error: 'This time slot is no longer available. Please select different dates.',
        },
      },
    };
  }

  const updated = await LeaveRequestModel.updatePendingRequest(requestId, {
    startDate: start,
    endDate: end,
    reason,
  });

  if (!updated) {
    return { error: { status: 500, body: { error: 'Failed to update request' } } };
  }

  return { data: updated };
}

export async function previewLeaveAvailability(params: {
  user: AuthUser;
  startDate: string;
  endDate: string;
}): Promise<ServiceResult<{ available: boolean; message: string }>> {
  const { user, startDate, endDate } = params;

  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const requestUser = await UserModel.findById(user.id);
  if (!requestUser) {
    return { error: { status: 404, body: { error: 'User not found' } } };
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return { error: { status: 400, body: { error: 'Invalid date range' } } };
  }

  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (rangeDays > 45) {
    return {
      data: {
        available: false,
        message: 'Preview supports date ranges up to 45 days.',
      },
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestStartDate = new Date(start);
  requestStartDate.setHours(0, 0, 0, 0);
  const daysDifference = Math.ceil(
    (requestStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const bypassActive = isBypassNoticePeriodActive(team, today);
  if (!bypassActive && daysDifference < team.settings.minimumNoticePeriod) {
    return {
      data: {
        available: false,
        message: `Minimum notice is ${team.settings.minimumNoticePeriod} day(s).`,
      },
    };
  }

  const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(user.teamId, start, end);
  const teamMembers = await UserModel.findByTeamId(user.teamId);
  const userSubgroupMap = new Map<string, string>();
  const userShiftTagMap = new Map<string, string | undefined>();
  const userMap = new Map<string, (typeof teamMembers)[number]>();
  teamMembers.forEach(member => {
    if (member._id) {
      const memberId = String(member._id);
      userSubgroupMap.set(memberId, member.subgroupTag || 'Ungrouped');
      userShiftTagMap.set(memberId, member.shiftTag);
      userMap.set(memberId, member);
    }
  });

  const requestStartDateTx = new Date(start);
  requestStartDateTx.setHours(0, 0, 0, 0);
  const requestEndDateTx = new Date(end);
  requestEndDateTx.setHours(0, 0, 0, 0);

  let exceedsConcurrentLimit = false;
  for (
    let checkDate = new Date(requestStartDateTx);
    checkDate <= requestEndDateTx;
    checkDate.setDate(checkDate.getDate() + 1)
  ) {
    if (!isWorkingDay(checkDate, requestUser)) {
      continue;
    }

    let relevantOverlappingCount = 0;
    for (const req of overlappingRequests) {
      const reqStart = parseDateSafe(req.startDate);
      const reqEnd = parseDateSafe(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);

      if (checkDate < reqStart || checkDate > reqEnd) {
        continue;
      }

      const reqUserId = String(req.userId);
      const reqUser = userMap.get(reqUserId);
      if (!reqUser) {
        relevantOverlappingCount++;
        continue;
      }

      if (!isWorkingDay(checkDate, reqUser)) {
        continue;
      }

      if (team.settings.enableSubgrouping) {
        const requestingSubgroup = requestUser.subgroupTag || 'Ungrouped';
        const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
        if (requestingSubgroup !== reqUserSubgroup) continue;
      }

      if (requestUser.shiftTag !== undefined) {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== requestUser.shiftTag) continue;
      } else {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== undefined) continue;
      }

      relevantOverlappingCount++;
    }

    if (relevantOverlappingCount >= team.settings.concurrentLeave) {
      exceedsConcurrentLimit = true;
      break;
    }
  }

  if (exceedsConcurrentLimit) {
    return {
      data: {
        available: false,
        message: 'High demand on selected dates. Availability is limited.',
      },
    };
  }

  return {
    data: {
      available: true,
      message: 'Dates look available based on current team requests.',
    },
  };
}

export async function getLeaveDateConstraints(params: {
  user: AuthUser;
  from: string;
  to: string;
}): Promise<ServiceResult<{ days: Record<string, LeaveDateConstraintDay> }>> {
  const { user, from, to } = params;

  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const requestUser = await UserModel.findById(user.id);
  if (!requestUser) {
    return { error: { status: 404, body: { error: 'User not found' } } };
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const start = parseDateSafe(from);
  const end = parseDateSafe(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return { error: { status: 400, body: { error: 'Invalid range' } } };
  }

  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (rangeDays > 120) {
    return { error: { status: 400, body: { error: 'Range too large (max 120 days)' } } };
  }

  const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(user.teamId, start, end);
  const pendingOverlaps = await LeaveRequestModel.findPendingOverlappingRequestsForUser(user.id, start, end);
  const pendingOverlapDays = new Set<string>();
  pendingOverlaps.forEach(req => {
    const reqStart = parseDateSafe(req.startDate);
    reqStart.setHours(0, 0, 0, 0);
    const reqEnd = parseDateSafe(req.endDate);
    reqEnd.setHours(0, 0, 0, 0);
    for (let d = new Date(reqStart); d <= reqEnd; d.setDate(d.getDate() + 1)) {
      pendingOverlapDays.add(d.toISOString().split('T')[0]);
    }
  });

  const teamMembers = await UserModel.findByTeamId(user.teamId);
  const userSubgroupMap = new Map<string, string>();
  const userShiftTagMap = new Map<string, string | undefined>();
  const userMap = new Map<string, (typeof teamMembers)[number]>();
  teamMembers.forEach(member => {
    if (member._id) {
      const memberId = String(member._id);
      userSubgroupMap.set(memberId, member.subgroupTag || 'Ungrouped');
      userShiftTagMap.set(memberId, member.shiftTag);
      userMap.set(memberId, member);
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bypassActive = isBypassNoticePeriodActive(team, today);

  const days: Record<string, LeaveDateConstraintDay> = {};
  const iter = new Date(start);
  iter.setHours(0, 0, 0, 0);
  const iterEnd = new Date(end);
  iterEnd.setHours(0, 0, 0, 0);

  while (iter <= iterEnd) {
    const current = new Date(iter);
    const dayKey = current.toISOString().split('T')[0];
    const codes: LeaveDateConstraintCode[] = [];

    if (current < today) {
      codes.push('PAST_DATE');
    }

    if (!isWorkingDay(current, requestUser)) {
      codes.push('NON_WORKING_DAY');
    }

    const daysDifference = Math.ceil((current.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (!bypassActive && daysDifference < team.settings.minimumNoticePeriod) {
      codes.push('NOTICE_PERIOD');
    }

    if (pendingOverlapDays.has(dayKey)) {
      codes.push('OWN_PENDING_OVERLAP');
    }

    let relevantOverlappingCount = 0;
    for (const req of overlappingRequests) {
      const reqStart = parseDateSafe(req.startDate);
      const reqEnd = parseDateSafe(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      if (current < reqStart || current > reqEnd) continue;

      const reqUserId = String(req.userId);
      const reqUser = userMap.get(reqUserId);
      if (!reqUser) {
        relevantOverlappingCount++;
        continue;
      }
      if (!isWorkingDay(current, reqUser)) continue;

      if (team.settings.enableSubgrouping) {
        const requestingSubgroup = requestUser.subgroupTag || 'Ungrouped';
        const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
        if (requestingSubgroup !== reqUserSubgroup) continue;
      }

      if (requestUser.shiftTag !== undefined) {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== requestUser.shiftTag) continue;
      } else {
        const reqUserShiftTag = userShiftTagMap.get(reqUserId);
        if (reqUserShiftTag !== undefined) continue;
      }

      relevantOverlappingCount++;
    }

    if (relevantOverlappingCount >= team.settings.concurrentLeave) {
      codes.push('CAPACITY_FULL');
    }

    const selectable = codes.length === 0;
    const message = selectable
      ? 'Available'
      : codes.includes('PAST_DATE')
      ? 'Past dates cannot be requested'
      : codes.includes('NOTICE_PERIOD')
      ? `Requires ${team.settings.minimumNoticePeriod} day(s) notice`
      : codes.includes('CAPACITY_FULL')
      ? 'Team capacity is full for this date'
      : codes.includes('OWN_PENDING_OVERLAP')
      ? 'You already have a pending request for this date'
      : codes.includes('NON_WORKING_DAY')
      ? 'Not a scheduled working day'
      : 'Not selectable';

    days[dayKey] = { selectable, codes: selectable ? ['OK'] : codes, message };
    iter.setDate(iter.getDate() + 1);
  }

  return { data: { days } };
}
