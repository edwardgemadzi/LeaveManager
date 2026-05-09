import type { AuthUser, CreateLeaveSwapRequestBody, LeaveSwapRequest, LeaveRequest, Team, User } from '@/types';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { LeaveSwapRequestModel } from '@/models/LeaveSwapRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { getClient } from '@/lib/mongodb';
import { formatDateSafe, parseDateSafe } from '@/lib/dateUtils';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { isBypassNoticePeriodActive } from '@/lib/noticePeriod';
import { validateLeaveDatesAgainstTeamPolicy } from '@/lib/leaveDateRules';
import { teamIdsMatch } from '@/lib/helpers';
import type { ClientSession } from 'mongodb';

type ServiceError = { status: number; body: Record<string, unknown> };
type ServiceSuccess<T> = { data: T };
export type ServiceResult<T> = ServiceSuccess<T> | { error: ServiceError };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(d: Date): string {
  return formatDateSafe(d);
}

/** Calendar overlap inclusive on date-only keys. */
function rangesOverlapCalendar(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  const as = parseDateSafe(aStart);
  const ae = parseDateSafe(aEnd);
  const bs = parseDateSafe(bStart);
  const be = parseDateSafe(bEnd);
  return ymd(as) <= ymd(be) && ymd(bs) <= ymd(ae);
}

function subrangeContainedInRange(
  subStart: Date,
  subEnd: Date,
  rStart: Date,
  rEnd: Date
): boolean {
  const ss = parseDateSafe(subStart);
  const se = parseDateSafe(subEnd);
  const rs = parseDateSafe(rStart);
  const re = parseDateSafe(rEnd);
  return ymd(rs) <= ymd(ss) && ymd(se) <= ymd(re) && ymd(ss) <= ymd(se);
}

function hasWorkingDayInRange(start: Date, end: Date, user: User): boolean {
  const s = parseDateSafe(start);
  const e = parseDateSafe(end);
  for (let d = new Date(s); ymd(d) <= ymd(e); d.setDate(d.getDate() + 1)) {
    if (isWorkingDay(new Date(d), user)) return true;
  }
  return false;
}

function snapshotsMatchLeave(
  leave: LeaveRequest,
  snapStart: Date,
  snapEnd: Date
): boolean {
  return (
    ymd(parseDateSafe(leave.startDate)) === ymd(parseDateSafe(snapStart)) &&
    ymd(parseDateSafe(leave.endDate)) === ymd(parseDateSafe(snapEnd))
  );
}

async function teamConcurrentExceeded(
  team: Team,
  requestUser: User,
  rangeStart: Date,
  rangeEnd: Date,
  overlappingRequests: LeaveRequest[],
  teamMembers: User[]
): Promise<boolean> {
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

  const requestStartDateTx = parseDateSafe(rangeStart);
  requestStartDateTx.setHours(0, 0, 0, 0);
  const requestEndDateTx = parseDateSafe(rangeEnd);
  requestEndDateTx.setHours(0, 0, 0, 0);

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
      return true;
    }
  }

  return false;
}

export async function validateSwapTargetDates(params: {
  team: Team;
  memberUser: User;
  memberId: string;
  teamId: string;
  sourceLeave: LeaveRequest;
  targetStart: Date;
  targetEnd: Date;
  excludeLeaveRequestId: string;
  session?: ClientSession;
}): Promise<ServiceResult<void>> {
  const {
    team,
    memberUser,
    memberId,
    teamId,
    sourceLeave,
    targetStart,
    targetEnd,
    excludeLeaveRequestId,
    session,
  } = params;

  const tStart = parseDateSafe(targetStart);
  const tEnd = parseDateSafe(targetEnd);
  if (Number.isNaN(tStart.getTime()) || Number.isNaN(tEnd.getTime()) || tStart > tEnd) {
    return { error: { status: 400, body: { error: 'Invalid target date range' } } };
  }

  const rStart = parseDateSafe(sourceLeave.startDate);
  const rEnd = parseDateSafe(sourceLeave.endDate);

  if (rangesOverlapCalendar(tStart, tEnd, rStart, rEnd)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'Target dates must not overlap your existing leave for this request.',
        },
      },
    };
  }

  const policyError = validateLeaveDatesAgainstTeamPolicy({
    settings: team.settings,
    startDate: formatDateSafe(tStart),
    endDate: formatDateSafe(tEnd),
  });
  if (policyError) {
    return { error: { status: 400, body: { error: policyError } } };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestStartDate = new Date(tStart);
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
          error: `Target leave must start at least ${team.settings.minimumNoticePeriod} day(s) in advance.`,
        },
      },
    };
  }

  if (!hasWorkingDayInRange(tStart, tEnd, memberUser)) {
    return {
      error: { status: 400, body: { error: 'Target range has no scheduled working days for you.' } },
    };
  }

  const rangeDays = Math.ceil((tEnd.getTime() - tStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (rangeDays > 45) {
    return { error: { status: 400, body: { error: 'Swap target range cannot exceed 45 days.' } } };
  }

  const activeOverlaps = await LeaveRequestModel.findActiveOverlappingRequestsForUser(
    memberId,
    tStart,
    tEnd,
    excludeLeaveRequestId,
    session
  );
  if (activeOverlaps.length > 0) {
    return {
      error: {
        status: 409,
        body: { error: 'You already have leave covering one or more of the target dates.' },
      },
    };
  }

  const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
    teamId,
    tStart,
    tEnd,
    undefined,
    session
  );

  const teamMembers = await UserModel.findByTeamId(teamId);
  if (
    await teamConcurrentExceeded(team, memberUser, tStart, tEnd, overlappingRequests, teamMembers)
  ) {
    return {
      error: {
        status: 409,
        body: {
          error: 'This time slot is no longer available. Please select different dates.',
        },
      },
    };
  }

  return { data: undefined };
}

export async function createLeaveSwapRequest(params: {
  user: AuthUser;
  body: CreateLeaveSwapRequestBody;
}): Promise<ServiceResult<LeaveSwapRequest>> {
  const { user, body } = params;

  if (user.role !== 'member') {
    return { error: { status: 403, body: { error: 'Only members can request a date swap' } } };
  }
  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const {
    leaveRequestId,
    sourceSubStart: srcSubStartStr,
    sourceSubEnd: srcSubEndStr,
    targetStart: tgtStartStr,
    targetEnd: tgtEndStr,
    memberNote,
  } = body;

  if (!leaveRequestId || !srcSubStartStr || !srcSubEndStr || !tgtStartStr || !tgtEndStr) {
    return { error: { status: 400, body: { error: 'Missing required fields' } } };
  }

  const noteTrim = typeof memberNote === 'string' ? memberNote.trim().slice(0, 500) : undefined;

  const sourceSubStart = parseDateSafe(srcSubStartStr);
  const sourceSubEnd = parseDateSafe(srcSubEndStr);
  const targetStart = parseDateSafe(tgtStartStr);
  const targetEnd = parseDateSafe(tgtEndStr);

  if (
    Number.isNaN(sourceSubStart.getTime()) ||
    Number.isNaN(sourceSubEnd.getTime()) ||
    Number.isNaN(targetStart.getTime()) ||
    Number.isNaN(targetEnd.getTime())
  ) {
    return { error: { status: 400, body: { error: 'Invalid dates' } } };
  }

  if (sourceSubStart > sourceSubEnd || targetStart > targetEnd) {
    return { error: { status: 400, body: { error: 'End date must be on or after start date' } } };
  }

  const existingPending = await LeaveSwapRequestModel.findPendingByLeaveRequestId(leaveRequestId);
  if (existingPending) {
    return {
      error: {
        status: 409,
        body: { error: 'A pending swap already exists for this leave request.' },
      },
    };
  }

  const sourceLeave = await LeaveRequestModel.findById(leaveRequestId);
  if (!sourceLeave) {
    return { error: { status: 404, body: { error: 'Leave request not found' } } };
  }

  if (!teamIdsMatch(sourceLeave.teamId, user.teamId)) {
    return { error: { status: 403, body: { error: 'Forbidden' } } };
  }

  if (String(sourceLeave.userId).trim() !== String(user.id).trim()) {
    return { error: { status: 403, body: { error: 'You can only swap your own leave' } } };
  }

  if (sourceLeave.status !== 'approved') {
    return { error: { status: 400, body: { error: 'Only approved leave can be swapped' } } };
  }

  const team = await TeamModel.findById(user.teamId);
  if (!team) {
    return { error: { status: 404, body: { error: 'Team not found' } } };
  }

  const memberUser = await UserModel.findById(user.id);
  if (!memberUser) {
    return { error: { status: 404, body: { error: 'User not found' } } };
  }

  const rStart = parseDateSafe(sourceLeave.startDate);
  const rEnd = parseDateSafe(sourceLeave.endDate);

  if (!subrangeContainedInRange(sourceSubStart, sourceSubEnd, rStart, rEnd)) {
    return {
      error: {
        status: 400,
        body: { error: 'Source sub-range must fall within your approved leave dates.' },
      },
    };
  }

  const val = await validateSwapTargetDates({
    team,
    memberUser,
    memberId: user.id,
    teamId: user.teamId,
    sourceLeave,
    targetStart,
    targetEnd,
    excludeLeaveRequestId: leaveRequestId,
  });

  if ('error' in val) {
    return val;
  }

  const swap = await LeaveSwapRequestModel.create({
    userId: user.id,
    teamId: user.teamId,
    leaveRequestId,
    sourceSubStart,
    sourceSubEnd,
    targetStart,
    targetEnd,
    sourceSnapshotStart: rStart,
    sourceSnapshotEnd: rEnd,
    memberNote: noteTrim || undefined,
    status: 'pending',
  });

  return { data: swap };
}

export async function getLeaveSwapRequests(params: {
  user: AuthUser;
  status?: string | null;
}): Promise<ServiceResult<LeaveSwapRequest[]>> {
  const { user, status } = params;
  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const allowed = new Set(['pending', 'approved', 'rejected', 'cancelled']);
  const st = status && allowed.has(status) ? (status as LeaveSwapRequest['status']) : undefined;

  if (user.role === 'leader') {
    const list = await LeaveSwapRequestModel.findByTeamId(user.teamId, st ? { status: st } : undefined);
    return { data: list };
  }

  const list = await LeaveSwapRequestModel.findByUserId(user.id, st);
  return { data: list };
}

export async function previewLeaveSwap(params: {
  user: AuthUser;
  body: CreateLeaveSwapRequestBody;
}): Promise<ServiceResult<{ available: boolean; message: string }>> {
  const { user, body } = params;
  if (user.role !== 'member') {
    return { error: { status: 403, body: { error: 'Only members can preview a swap' } } };
  }
  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const sourceLeave = await LeaveRequestModel.findById(body.leaveRequestId);
  if (!sourceLeave || String(sourceLeave.userId).trim() !== user.id.trim()) {
    return { data: { available: false, message: 'Leave request not found.' } };
  }
  if (!teamIdsMatch(sourceLeave.teamId, user.teamId) || sourceLeave.status !== 'approved') {
    return { data: { available: false, message: 'Invalid leave request for swap.' } };
  }

  const team = await TeamModel.findById(user.teamId);
  const memberUser = await UserModel.findById(user.id);
  if (!team || !memberUser) {
    return { data: { available: false, message: 'Unable to load team or user.' } };
  }

  const sourceSubStart = parseDateSafe(body.sourceSubStart);
  const sourceSubEnd = parseDateSafe(body.sourceSubEnd);
  const targetStart = parseDateSafe(body.targetStart);
  const targetEnd = parseDateSafe(body.targetEnd);
  const rStart = parseDateSafe(sourceLeave.startDate);
  const rEnd = parseDateSafe(sourceLeave.endDate);

  if (!subrangeContainedInRange(sourceSubStart, sourceSubEnd, rStart, rEnd)) {
    return { data: { available: false, message: 'Source sub-range must be within your leave dates.' } };
  }

  const v = await validateSwapTargetDates({
    team,
    memberUser,
    memberId: user.id,
    teamId: user.teamId!,
    sourceLeave,
    targetStart,
    targetEnd,
    excludeLeaveRequestId: body.leaveRequestId,
  });

  if ('error' in v) {
    const msg =
      typeof v.error.body.error === 'string'
        ? v.error.body.error
        : 'Target dates are not available for swap.';
    return { data: { available: false, message: msg } };
  }

  return { data: { available: true, message: 'These target dates look available for a swap request.' } };
}

async function applyApprovedSwap(params: {
  sourceLeave: LeaveRequest;
  swap: LeaveSwapRequest;
  session: ClientSession;
}): Promise<void> {
  const { sourceLeave, swap, session } = params;
  const sourceId = swap.leaveRequestId;
  const R0 = parseDateSafe(sourceLeave.startDate);
  const R1 = parseDateSafe(sourceLeave.endDate);
  const S0 = parseDateSafe(swap.sourceSubStart);
  const S1 = parseDateSafe(swap.sourceSubEnd);
  const T0 = parseDateSafe(swap.targetStart);
  const T1 = parseDateSafe(swap.targetEnd);

  const sameRange =
    ymd(S0) === ymd(R0) && ymd(S1) === ymd(R1);
  const sAtStart = ymd(S0) === ymd(R0) && ymd(S1) < ymd(R1);
  const sAtEnd = ymd(S1) === ymd(R1) && ymd(S0) > ymd(R0);
  const sMiddle = ymd(S0) > ymd(R0) && ymd(S1) < ymd(R1);

  const reason = sourceLeave.reason;
  const userId = String(sourceLeave.userId);
  const teamId = String(sourceLeave.teamId);

  if (sameRange) {
    const ok = await LeaveRequestModel.updateApprovedDateRange(sourceId, T0, T1, session);
    if (!ok) throw new Error('UPDATE_SOURCE_FAILED');
    return;
  }

  if (sAtStart) {
    const newStart = addDays(S1, 1);
    const ok = await LeaveRequestModel.updateApprovedDateRange(sourceId, newStart, R1, session);
    if (!ok) throw new Error('UPDATE_SOURCE_FAILED');
    await LeaveRequestModel.create(
      {
        userId,
        teamId,
        startDate: T0,
        endDate: T1,
        reason,
        status: 'approved',
        submittedByMember: false,
      },
      session
    );
    return;
  }

  if (sAtEnd) {
    const newEnd = addDays(S0, -1);
    const ok = await LeaveRequestModel.updateApprovedDateRange(sourceId, R0, newEnd, session);
    if (!ok) throw new Error('UPDATE_SOURCE_FAILED');
    await LeaveRequestModel.create(
      {
        userId,
        teamId,
        startDate: T0,
        endDate: T1,
        reason,
        status: 'approved',
        submittedByMember: false,
      },
      session
    );
    return;
  }

  if (sMiddle) {
    const headEnd = addDays(S0, -1);
    const tailStart = addDays(S1, 1);
    const ok = await LeaveRequestModel.updateApprovedDateRange(sourceId, R0, headEnd, session);
    if (!ok) throw new Error('UPDATE_SOURCE_FAILED');
    await LeaveRequestModel.create(
      {
        userId,
        teamId,
        startDate: tailStart,
        endDate: R1,
        reason,
        status: 'approved',
        submittedByMember: false,
      },
      session
    );
    await LeaveRequestModel.create(
      {
        userId,
        teamId,
        startDate: T0,
        endDate: T1,
        reason,
        status: 'approved',
        submittedByMember: false,
      },
      session
    );
    return;
  }

  throw new Error('UNSUPPORTED_SWAP_SHAPE');
}

export async function decideLeaveSwapRequest(params: {
  user: AuthUser;
  swapId: string;
  status: 'approved' | 'rejected';
  decisionNote?: string;
}): Promise<ServiceResult<LeaveSwapRequest>> {
  const { user, swapId, status, decisionNote } = params;

  if (user.role !== 'leader') {
    return { error: { status: 403, body: { error: 'Only leaders can decide swap requests' } } };
  }
  if (!user.teamId) {
    return { error: { status: 400, body: { error: 'No team assigned' } } };
  }

  const note = typeof decisionNote === 'string' ? decisionNote.trim() : '';
  if (status === 'rejected' && note.length === 0) {
    return { error: { status: 400, body: { error: 'Rejection reason is required' } } };
  }
  if (note.length > 500) {
    return { error: { status: 400, body: { error: 'Decision note must be 500 characters or fewer' } } };
  }

  const actor = await UserModel.findById(user.id);
  if (!actor) {
    return { error: { status: 404, body: { error: 'User not found' } } };
  }

  const swapPre = await LeaveSwapRequestModel.findById(swapId);
  if (!swapPre || !teamIdsMatch(swapPre.teamId, user.teamId)) {
    return { error: { status: 404, body: { error: 'Swap request not found' } } };
  }

  if (swapPre.status !== 'pending') {
    return { error: { status: 409, body: { error: 'This swap request is no longer pending' } } };
  }

  if (status === 'rejected') {
    const ok = await LeaveSwapRequestModel.updateDecision(swapId, {
      status: 'rejected',
      decisionNote: note,
      byUserId: user.id,
      byUsername: actor.username,
    });
    if (!ok) {
      return { error: { status: 409, body: { error: 'Swap request is no longer pending' } } };
    }
    const updated = await LeaveSwapRequestModel.findById(swapId);
    return { data: updated! };
  }

  const team = await TeamModel.findById(user.teamId);
  const memberUser = await UserModel.findById(swapPre.userId);
  if (!team || !memberUser) {
    return { error: { status: 404, body: { error: 'Team or member not found' } } };
  }

  const sourcePre = await LeaveRequestModel.findById(swapPre.leaveRequestId);
  if (
    !sourcePre ||
    sourcePre.status !== 'approved' ||
    !snapshotsMatchLeave(sourcePre, swapPre.sourceSnapshotStart, swapPre.sourceSnapshotEnd)
  ) {
    await LeaveSwapRequestModel.updateDecision(swapId, {
      status: 'rejected',
      decisionNote:
        'Automatically rejected: the original leave changed or is no longer approved. Please submit a new swap.',
      byUserId: user.id,
      byUsername: actor.username,
    });
    const updated = await LeaveSwapRequestModel.findById(swapId);
    return {
      error: {
        status: 409,
        body: {
          error: 'The leave request changed since this swap was submitted; the swap was rejected.',
          swap: updated,
        },
      },
    };
  }

  const subOk = subrangeContainedInRange(
    parseDateSafe(swapPre.sourceSubStart),
    parseDateSafe(swapPre.sourceSubEnd),
    parseDateSafe(sourcePre.startDate),
    parseDateSafe(sourcePre.endDate)
  );
  if (!subOk) {
    await LeaveSwapRequestModel.updateDecision(swapId, {
      status: 'rejected',
      decisionNote:
        'Automatically rejected: the source sub-range no longer fits the current leave dates.',
      byUserId: user.id,
      byUsername: actor.username,
    });
    const updated = await LeaveSwapRequestModel.findById(swapId);
    return {
      error: {
        status: 409,
        body: {
          error: 'The approved leave dates changed; the swap was rejected.',
          swap: updated,
        },
      },
    };
  }

  const val = await validateSwapTargetDates({
    team,
    memberUser,
    memberId: swapPre.userId,
    teamId: user.teamId,
    sourceLeave: sourcePre,
    targetStart: parseDateSafe(swapPre.targetStart),
    targetEnd: parseDateSafe(swapPre.targetEnd),
    excludeLeaveRequestId: swapPre.leaveRequestId,
  });

  if ('error' in val) {
    await LeaveSwapRequestModel.updateDecision(swapId, {
      status: 'rejected',
      decisionNote: `Automatically rejected: ${String(val.error.body.error ?? 'validation failed')}`,
      byUserId: user.id,
      byUsername: actor.username,
    });
    const updated = await LeaveSwapRequestModel.findById(swapId);
    return {
      error: {
        status: 409,
        body: {
          error: String(val.error.body.error ?? 'Target dates are no longer available.'),
          swap: updated,
        },
      },
    };
  }

  const client = await getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      const swapIn = await LeaveSwapRequestModel.findById(swapId, session);
      if (!swapIn || swapIn.status !== 'pending') {
        throw Object.assign(new Error('NOT_PENDING'), { code: 'NOT_PENDING' });
      }

      const sourceIn = await LeaveRequestModel.findById(swapIn.leaveRequestId, false, session);
      if (
        !sourceIn ||
        sourceIn.status !== 'approved' ||
        !snapshotsMatchLeave(sourceIn, swapIn.sourceSnapshotStart, swapIn.sourceSnapshotEnd)
      ) {
        throw Object.assign(new Error('STALE'), { code: 'STALE' });
      }

      const sub = subrangeContainedInRange(
        parseDateSafe(swapIn.sourceSubStart),
        parseDateSafe(swapIn.sourceSubEnd),
        parseDateSafe(sourceIn.startDate),
        parseDateSafe(sourceIn.endDate)
      );
      if (!sub) {
        throw Object.assign(new Error('STALE'), { code: 'STALE' });
      }

      const valIn = await validateSwapTargetDates({
        team,
        memberUser,
        memberId: swapIn.userId,
        teamId: user.teamId!,
        sourceLeave: sourceIn,
        targetStart: parseDateSafe(swapIn.targetStart),
        targetEnd: parseDateSafe(swapIn.targetEnd),
        excludeLeaveRequestId: swapIn.leaveRequestId,
        session,
      });

      if ('error' in valIn) {
        throw Object.assign(new Error('VALIDATION'), { code: 'VALIDATION', payload: valIn.error });
      }

      await applyApprovedSwap({ sourceLeave: sourceIn, swap: swapIn, session });

      const decided = await LeaveSwapRequestModel.updateDecision(
        swapId,
        {
          status: 'approved',
          decisionNote: note || undefined,
          byUserId: user.id,
          byUsername: actor.username,
        },
        session
      );
      if (!decided) {
        throw Object.assign(new Error('NOT_PENDING'), { code: 'NOT_PENDING' });
      }
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; payload?: ServiceError };
    if (err.code === 'NOT_PENDING') {
      return { error: { status: 409, body: { error: 'This swap request is no longer pending' } } };
    }
    if (err.code === 'STALE' || err.code === 'VALIDATION') {
      const swapNow = await LeaveSwapRequestModel.findById(swapId);
      if (swapNow?.status === 'pending') {
        await LeaveSwapRequestModel.updateDecision(swapId, {
          status: 'rejected',
          decisionNote:
            err.code === 'STALE'
              ? 'Automatically rejected: the original leave changed during approval.'
              : `Automatically rejected: ${String((err.payload as ServiceError)?.body?.error ?? 'validation failed')}`,
          byUserId: user.id,
          byUsername: actor.username,
        });
      }
      const updated = await LeaveSwapRequestModel.findById(swapId);
      return {
        error: {
          status: 409,
          body: {
            error:
              err.code === 'STALE'
                ? 'The leave request changed during approval; the swap was rejected.'
                : String((err.payload as ServiceError)?.body?.error ?? 'Target dates are no longer available.'),
            swap: updated,
          },
        },
      };
    }
    const msg = err.message ?? '';
    if (msg === 'UPDATE_SOURCE_FAILED' || msg === 'UNSUPPORTED_SWAP_SHAPE') {
      const swapNow = await LeaveSwapRequestModel.findById(swapId);
      if (swapNow?.status === 'pending') {
        await LeaveSwapRequestModel.updateDecision(swapId, {
          status: 'rejected',
          decisionNote: 'Automatically rejected: leave records could not be updated.',
          byUserId: user.id,
          byUsername: actor.username,
        });
      }
      const updated = await LeaveSwapRequestModel.findById(swapId);
      return {
        error: {
          status: 500,
          body: {
            error: 'Failed to apply swap; the request was rejected.',
            swap: updated,
          },
        },
      };
    }
    throw e;
  } finally {
    await session.endSession();
  }

  const finalSwap = await LeaveSwapRequestModel.findById(swapId);
  return { data: finalSwap! };
}

export async function cancelLeaveSwapRequest(params: {
  user: AuthUser;
  swapId: string;
}): Promise<ServiceResult<{ cancelled: boolean }>> {
  const { user, swapId } = params;
  if (user.role !== 'member') {
    return { error: { status: 403, body: { error: 'Only members can cancel their swap request' } } };
  }

  const swap = await LeaveSwapRequestModel.findById(swapId);
  if (!swap || String(swap.userId).trim() !== user.id.trim()) {
    return { error: { status: 404, body: { error: 'Swap request not found' } } };
  }

  if (swap.status !== 'pending') {
    return { error: { status: 400, body: { error: 'Only pending swaps can be cancelled' } } };
  }

  const ok = await LeaveSwapRequestModel.cancelPending(swapId, user.id);
  if (!ok) {
    return { error: { status: 400, body: { error: 'Could not cancel swap request' } } };
  }

  return { data: { cancelled: true } };
}
