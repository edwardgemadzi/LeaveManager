import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import {
  notifyLeaveApproachingReminder,
  notifyLeaderTeamLeaveApproaching,
} from '@/services/notificationService';
import { calendarDaysUntilLeaveStartInZone } from '@/lib/timezone';
import {
  effectiveMemberReminderDays,
  effectiveLeaderTeamReminderDays,
  leaderOffsetsAlreadySent,
  memberOffsetsAlreadySent,
} from '@/lib/leaveReminderPrefs';

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
    const needMember = memberOffsets.filter((d) => d === days && !memberSent.has(d));

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
    const needLeader = leaderOffsets.filter((d) => d === days && !leaderSent.has(d));

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
