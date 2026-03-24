import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { notifyLeaveApproachingReminder } from '@/services/notificationService';
import { calendarDaysUntilLeaveStartInZone } from '@/lib/timezone';

export type LeaveReminderRunResult = {
  processed: number;
  sent10: number;
  sent5: number;
  skipped: number;
  failed: number;
};

/**
 * Send 10-day and 5-day reminders for approved leave (email + Telegram per user prefs).
 * Idempotent via reminder10DaysSentAt / reminder5DaysSentAt on each request.
 */
export async function runLeaveApproachingReminders(now = new Date()): Promise<LeaveReminderRunResult> {
  const result: LeaveReminderRunResult = {
    processed: 0,
    sent10: 0,
    sent5: 0,
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

    const need10 = days === 10 && !req.reminder10DaysSentAt;
    const need5 = days === 5 && !req.reminder5DaysSentAt;

    if (!need10 && !need5) {
      result.skipped++;
      continue;
    }

    const team = await TeamModel.findById(String(req.teamId));
    const teamName = team?.name || 'Your team';

    try {
      if (need10) {
        await notifyLeaveApproachingReminder({
          leaveRequest: req,
          member,
          teamName,
          daysUntil: 10,
        });
        await LeaveRequestModel.markReminderSent(req._id, '10');
        result.sent10++;
      }
      if (need5) {
        await notifyLeaveApproachingReminder({
          leaveRequest: req,
          member,
          teamName,
          daysUntil: 5,
        });
        await LeaveRequestModel.markReminderSent(req._id, '5');
        result.sent5++;
      }
    } catch {
      result.failed++;
    }
  }

  return result;
}
