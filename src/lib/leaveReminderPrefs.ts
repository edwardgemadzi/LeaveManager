import type { LeaveRequest, User } from '@/types';
import { resolveUserTimeZone } from '@/lib/timezone';

export const DEFAULT_LEAVE_REMINDER_DAYS: readonly number[] = [5, 1];
export const DEFAULT_LEADER_TEAM_REMINDER_DAYS: readonly number[] = [5, 1];

/** Max calendar day offset we scan in cron (must match findApprovedForReminderScan window). */
export const MAX_REMINDER_DAY_OFFSET = 90;

function cleanDayList(v: number[]): number[] {
  const cleaned = [
    ...new Set(v.filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_REMINDER_DAY_OFFSET)),
  ];
  return cleaned.sort((a, b) => b - a);
}

/** Days before my approved leave starts to remind me (empty array in DB = off). */
export function effectiveMemberReminderDays(
  user: Pick<User, 'leaveReminderDaysBefore'> | null | undefined
): number[] {
  const v = user?.leaveReminderDaysBefore;
  if (v === undefined || v === null) return [...DEFAULT_LEAVE_REMINDER_DAYS];
  if (v.length === 0) return [];
  return cleanDayList(v);
}

/** Days before a teammate's approved leave to remind the team leader (empty array = off). */
export function effectiveLeaderTeamReminderDays(
  user: Pick<User, 'leaderTeamLeaveReminderDays' | 'role'> | null | undefined
): number[] {
  if (!user || user.role !== 'leader') return [];
  const v = user.leaderTeamLeaveReminderDays;
  if (v === undefined || v === null) return [...DEFAULT_LEADER_TEAM_REMINDER_DAYS];
  if (v.length === 0) return [];
  return cleanDayList(v);
}

export function memberOffsetsAlreadySent(req: LeaveRequest): Set<number> {
  const s = new Set(req.reminderMemberOffsetsSent ?? []);
  if (req.reminder10DaysSentAt) s.add(10);
  if (req.reminder5DaysSentAt) s.add(5);
  return s;
}

export function leaderOffsetsAlreadySent(req: LeaveRequest): Set<number> {
  return new Set(req.reminderLeaderOffsetsSent ?? []);
}

function ymdInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True if leave end date is today or later in the member's calendar (notify cancel/delete). */
export function isLeaveEndOnOrAfterTodayInMemberZone(
  leave: Pick<LeaveRequest, 'endDate'>,
  now: Date,
  memberTimeZone: string | null | undefined
): boolean {
  const tz = resolveUserTimeZone(memberTimeZone);
  const todayYmd = ymdInZone(now, tz);
  const end = leave.endDate instanceof Date ? leave.endDate : new Date(leave.endDate);
  const endYmd = ymdInZone(end, tz);
  return endYmd >= todayYmd;
}
