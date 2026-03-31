import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import {
  notifyLeaveApproachingReminder,
  notifyLeaderTeamLeaveApproaching,
} from '@/services/notificationService';
import { calendarDaysUntilLeaveStartInZone, hourInZone } from '@/lib/timezone';
import {
  effectiveMemberReminderDays,
  effectiveLeaderTeamReminderDays,
  leaderOffsetsAlreadySent,
  memberOffsetsAlreadySent,
} from '@/lib/leaveReminderPrefs';

/** Parse "HH:MM" → hour (0-23). Falls back to 9. */
function preferredHour(timeLocal: string | null | undefined): number {
  if (!timeLocal) return 9;
  const h = parseInt(timeLocal.split(':')[0], 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 9;
}

/** True if the cron is running within the user's preferred reminder hour. */
function isUsersReminderHour(user: { timezone?: string | null; leaveReminderTimeLocal?: string | null }, now: Date): boolean {
  return hourInZone(now, user.timezone) === preferredHour(user.leaveReminderTimeLocal);
}

export type LeaveReminderRunResult = {
  processed: number;
  sentMember: number;
  sentLeader: number;
  skipped: number;
  failed: number;
};

/**
 * Send configurable upcoming-leave reminders (member + team leader), idempotent per offset on each request.
 */
export async function runLeaveApproachingReminders(now = new Date()): Promise<LeaveReminderRunResult> {
  const result: LeaveReminderRunResult = {
    processed: 0,
    sentMember: 0,
    sentLeader: 0,
    skipped: 0,
    failed: 0,
  };

  // Cron runs hourly (via external trigger e.g. cron-job.org → /api/cron/leave-reminders).
  // Each user's reminder fires only during their preferred local hour (leaveReminderTimeLocal,
  // default 09:00 in their timezone). Idempotency is handled by reminderMemberOffsetsSent /
  // reminderLeaderOffsetsSent on each leave request, so duplicate hits within the same hour
  // are safe.
  const candidates = await LeaveRequestModel.findApprovedForReminderScan(now);

  for (const req of candidates) {
    if (!req._id) continue;
    result.processed++;

    const member = await UserModel.findById(String(req.userId));
    if (!member) {
      result.failed++;
      continue;
    }

    const start =
      req.startDate instanceof Date ? req.startDate : new Date(req.startDate);
    const days = calendarDaysUntilLeaveStartInZone(start, now, member.timezone);

    const team = await TeamModel.findById(String(req.teamId));
    const teamName = team?.name || 'Your team';

    const memberSent = memberOffsetsAlreadySent(req);
    const leaderSent = leaderOffsetsAlreadySent(req);

    const memberOffsets = effectiveMemberReminderDays(member);
    const needMember = isUsersReminderHour(member, now)
      ? memberOffsets.filter((d) => d === days && !memberSent.has(d))
      : [];

    let leader: Awaited<ReturnType<typeof UserModel.findById>> = null;
    let leaderOffsets: number[] = [];
    if (team?.leaderId) {
      leader = await UserModel.findById(String(team.leaderId));
      if (
        leader &&
        leader._id &&
        String(leader._id) !== String(member._id)
      ) {
        leaderOffsets = effectiveLeaderTeamReminderDays(leader);
      }
    }
    const needLeader =
      leader && isUsersReminderHour(leader, now)
        ? leaderOffsets.filter((d) => d === days && !leaderSent.has(d))
        : [];

    if (needMember.length === 0 && needLeader.length === 0) {
      result.skipped++;
      continue;
    }

    try {
      for (const d of needMember) {
        await notifyLeaveApproachingReminder({
          leaveRequest: req,
          member,
          teamName,
          daysUntil: d,
        });
        await LeaveRequestModel.markMemberReminderOffsetSent(req._id, d);
        result.sentMember++;
      }

      if (leader && needLeader.length > 0) {
        for (const d of needLeader) {
          await notifyLeaderTeamLeaveApproaching({
            leaveRequest: req,
            leader,
            member,
            teamName,
            daysUntil: d,
          });
          await LeaveRequestModel.markLeaderReminderOffsetSent(req._id, d);
          result.sentLeader++;
        }
      }
    } catch {
      result.failed++;
    }
  }

  return result;
}
