import type { LeaveRequest, User } from '@/types';
import { shell, formatDateRange, escapeForHtml, sendHtmlEmail } from '@/lib/mailer';
import { sendTelegramMessage } from '@/lib/telegram';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';

function appBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, '')}`;
  }
  return 'http://localhost:3000';
}

function wantsEmail(u: Pick<User, 'email' | 'notifyEmail'> | null | undefined): boolean {
  if (!u?.email?.trim()) return false;
  if (u.notifyEmail === false) return false;
  return true;
}

function wantsTelegram(u: Pick<User, 'telegramUserId' | 'notifyTelegram'> | null | undefined): boolean {
  if (!u?.telegramUserId) return false;
  if (u.notifyTelegram === false) return false;
  return true;
}

/**
 * Fire-and-forget safe for local; callers on Vercel should await this before returning HTTP response.
 */
export async function notifyLeaveSubmitted(params: {
  leaveRequest: LeaveRequest;
  member: User;
  teamName: string;
}): Promise<void> {
  const { leaveRequest, member, teamName } = params;
  const start = leaveRequest.startDate instanceof Date
    ? leaveRequest.startDate.toISOString().split('T')[0]
    : String(leaveRequest.startDate);
  const end = leaveRequest.endDate instanceof Date
    ? leaveRequest.endDate.toISOString().split('T')[0]
    : String(leaveRequest.endDate);
  const range = formatDateRange(start, end);
  const base = appBaseUrl();
  const requestsLink = `${base}/member/requests`;

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(member.username)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Your leave request was submitted and is <strong>pending approval</strong>.</p>
      <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:${'#64748b'};font-size:13px;">Team</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(teamName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(range)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(leaveRequest.reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${requestsLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View my requests</a>
      </p>
    `;
    tasks.push(
      sendHtmlEmail({
        to: member.email!.trim(),
        subject: `Leave request submitted — ${range}`,
        html: shell(inner, {
          title: 'Request received',
          preheader: `Pending approval · ${range}`,
        }),
      })
    );
  }

  if (wantsTelegram(member)) {
    tasks.push(
      sendTelegramMessage({
        chatId: member.telegramUserId!,
        text:
          `Leave request submitted\n` +
          `Team: ${teamName}\n` +
          `Dates: ${range}\n` +
          `Reason: ${leaveRequest.reason}\n` +
          `Status: pending approval`,
      })
    );
  }

  const team = await TeamModel.findById(String(leaveRequest.teamId));
  if (team?.leaderId) {
    const leader = await UserModel.findById(String(team.leaderId));
    if (leader && leader._id && String(leader._id) !== String(member._id)) {
      const leaderLink = `${base}/leader/requests`;
      const memberLabel = member.fullName?.trim() || member.username;

      if (wantsEmail(leader)) {
        const inner = `
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${escapeForHtml(memberLabel)}</strong> submitted a leave request.</p>
          <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(range)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(leaveRequest.reason)}</td></tr>
          </table>
          <p style="margin:20px 0 0;">
            <a href="${leaderLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review requests</a>
          </p>
        `;
        tasks.push(
          sendHtmlEmail({
            to: leader.email!.trim(),
            subject: `New leave request from ${memberLabel} — ${range}`,
            html: shell(inner, {
              title: 'New leave request',
              preheader: `${memberLabel} · ${range}`,
            }),
          })
        );
      }

      if (wantsTelegram(leader)) {
        tasks.push(
          sendTelegramMessage({
            chatId: leader.telegramUserId!,
            text:
              `New leave request\n` +
              `From: ${memberLabel}\n` +
              `Dates: ${range}\n` +
              `Reason: ${leaveRequest.reason}`,
          })
        );
      }
    }
  }

  await Promise.allSettled(tasks);
}

export async function notifyLeaveDecision(params: {
  leaveRequest: LeaveRequest;
  member: User;
  status: 'approved' | 'rejected';
  decisionNote?: string;
  leaderUsername: string;
}): Promise<void> {
  const { leaveRequest, member, status, decisionNote, leaderUsername } = params;
  const start = leaveRequest.startDate instanceof Date
    ? leaveRequest.startDate.toISOString().split('T')[0]
    : String(leaveRequest.startDate);
  const end = leaveRequest.endDate instanceof Date
    ? leaveRequest.endDate.toISOString().split('T')[0]
    : String(leaveRequest.endDate);
  const range = formatDateRange(start, end);
  const base = appBaseUrl();
  const link = `${base}/member/requests`;

  const subject =
    status === 'approved'
      ? `Leave approved — ${range}`
      : `Leave request declined — ${range}`;

  const statusWord = status === 'approved' ? 'approved' : 'declined';
  const noteHtml =
    status === 'rejected' && decisionNote
      ? `<p style="margin:12px 0;font-size:14px;line-height:1.5;color:#334155;"><strong>Note from approver:</strong> ${escapeForHtml(decisionNote)}</p>`
      : decisionNote && status === 'approved'
        ? `<p style="margin:12px 0;font-size:14px;line-height:1.5;color:#334155;"><strong>Note:</strong> ${escapeForHtml(decisionNote)}</p>`
        : '';

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(member.username)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Your leave request (${escapeForHtml(range)}) was <strong>${escapeForHtml(statusWord)}</strong> by ${escapeForHtml(leaderUsername)}.</p>
      ${noteHtml}
      <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(leaveRequest.reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View my requests</a>
      </p>
    `;
    tasks.push(
      sendHtmlEmail({
        to: member.email!.trim(),
        subject,
        html: shell(inner, {
          title: status === 'approved' ? 'Leave approved' : 'Leave declined',
          preheader: `${range} · ${statusWord}`,
        }),
      })
    );
  }

  if (wantsTelegram(member)) {
    const note =
      decisionNote && status === 'rejected'
        ? `\nNote: ${decisionNote}`
        : decisionNote && status === 'approved'
          ? `\nNote: ${decisionNote}`
          : '';
    tasks.push(
      sendTelegramMessage({
        chatId: member.telegramUserId!,
        text:
          `Leave ${status === 'approved' ? 'approved' : 'declined'}\n` +
          `Dates: ${range}\n` +
          `By: ${leaderUsername}${note}`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

/** Reminder that approved leave starts in `daysUntil` calendar days (10 or 5). */
export async function notifyLeaveApproachingReminder(params: {
  leaveRequest: LeaveRequest;
  member: User;
  teamName: string;
  daysUntil: 10 | 5;
}): Promise<void> {
  const { leaveRequest, member, teamName, daysUntil } = params;
  const start = leaveRequest.startDate instanceof Date
    ? leaveRequest.startDate.toISOString().split('T')[0]
    : String(leaveRequest.startDate);
  const end = leaveRequest.endDate instanceof Date
    ? leaveRequest.endDate.toISOString().split('T')[0]
    : String(leaveRequest.endDate);
  const range = formatDateRange(start, end);
  const base = appBaseUrl();
  const link =
    member.role === 'leader'
      ? `${base}/leader/calendar`
      : `${base}/member/requests`;
  const when =
    daysUntil === 10
      ? 'Your approved leave starts in 10 days.'
      : 'Your approved leave starts in 5 days.';

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(member.username)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${escapeForHtml(when)}</strong></p>
      <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Team</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(teamName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(range)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(leaveRequest.reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View my requests</a>
      </p>
    `;
    tasks.push(
      sendHtmlEmail({
        to: member.email!.trim(),
        subject: `Leave reminder: starts in ${daysUntil} days — ${range}`,
        html: shell(inner, {
          title: `Leave in ${daysUntil} days`,
          preheader: `${when} ${range}`,
        }),
      })
    );
  }

  if (wantsTelegram(member)) {
    tasks.push(
      sendTelegramMessage({
        chatId: member.telegramUserId!,
        text:
          `Leave reminder (${daysUntil} days)\n` +
          `${when}\n` +
          `Team: ${teamName}\n` +
          `Dates: ${range}\n` +
          `Reason: ${leaveRequest.reason}`,
      })
    );
  }

  await Promise.allSettled(tasks);
}
