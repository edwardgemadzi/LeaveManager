import type { LeaveRequest, User } from '@/types';
import { shell, formatDateRange, escapeForHtml, sendHtmlEmail } from '@/lib/mailer';
import { sendTelegramMessage } from '@/lib/telegram';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { createSingleUseMagicLinkToken } from '@/lib/magicLink';

function displayName(u: Pick<User, 'firstName' | 'middleName' | 'lastName' | 'fullName' | 'username'>): string {
  const first = (u.firstName || '').trim();
  const middle = (u.middleName || '').trim();
  const last = (u.lastName || '').trim();
  const parts = [first, middle, last].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  const legacy = (u.fullName || '').trim();
  if (legacy) return legacy;
  return u.username;
}

function greetingName(u: Pick<User, 'firstName' | 'fullName' | 'username'>): string {
  const first = (u.firstName || '').trim();
  if (first) return first;
  const legacy = (u.fullName || '').trim();
  if (legacy) return legacy;
  return u.username;
}

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
  const requestsMagic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: '/member/requests',
  });
  const requestsLink = `${base}/api/auth/magic?token=${encodeURIComponent(requestsMagic)}`;

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
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
      const leaderMagic = await createSingleUseMagicLinkToken({
        userId: String(leader._id),
        nextPath: '/leader/requests',
      });
      const leaderLink = `${base}/api/auth/magic?token=${encodeURIComponent(leaderMagic)}`;
      const memberLabel = displayName(member);

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

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value);
}

function buildRangeSummary(leaveRequests: LeaveRequest[]): { singleLine: string; lines: string[] } {
  const ranges = leaveRequests
    .map((request) => formatDateRange(toIsoDate(request.startDate), toIsoDate(request.endDate)))
    .sort((a, b) => a.localeCompare(b));
  return {
    singleLine: ranges.join(', '),
    lines: ranges,
  };
}

export async function notifyLeaveSubmittedBatch(params: {
  leaveRequests: LeaveRequest[];
  member: User;
  teamName: string;
}): Promise<void> {
  const { leaveRequests, member, teamName } = params;
  if (leaveRequests.length === 0) return;
  if (leaveRequests.length === 1) {
    await notifyLeaveSubmitted({ leaveRequest: leaveRequests[0], member, teamName });
    return;
  }

  const { singleLine, lines } = buildRangeSummary(leaveRequests);
  const base = appBaseUrl();
  const requestsMagic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: '/member/requests',
  });
  const requestsLink = `${base}/api/auth/magic?token=${encodeURIComponent(requestsMagic)}`;
  const reason = leaveRequests[0].reason;
  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const rangesHtml = lines.map((line) => `<li>${escapeForHtml(line)}</li>`).join('');
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Your leave request was submitted and is <strong>pending approval</strong>.</p>
      <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:${'#64748b'};font-size:13px;">Team</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(teamName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;"><ul style="margin:0;padding-left:18px;">${rangesHtml}</ul></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${requestsLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View my requests</a>
      </p>
    `;
    tasks.push(
      sendHtmlEmail({
        to: member.email!.trim(),
        subject: `Leave request submitted — ${singleLine}`,
        html: shell(inner, {
          title: 'Request received',
          preheader: `Pending approval · ${singleLine}`,
        }),
      })
    );
  }

  if (wantsTelegram(member)) {
    const rangeLines = lines.map((line) => `- ${line}`).join('\n');
    tasks.push(
      sendTelegramMessage({
        chatId: member.telegramUserId!,
        text:
          `Leave request submitted\n` +
          `Team: ${teamName}\n` +
          `Dates:\n${rangeLines}\n` +
          `Reason: ${reason}\n` +
          `Status: pending approval`,
      })
    );
  }

  const team = await TeamModel.findById(String(leaveRequests[0].teamId));
  if (team?.leaderId) {
    const leader = await UserModel.findById(String(team.leaderId));
    if (leader && leader._id && String(leader._id) !== String(member._id)) {
      const leaderMagic = await createSingleUseMagicLinkToken({
        userId: String(leader._id),
        nextPath: '/leader/requests',
      });
      const leaderLink = `${base}/api/auth/magic?token=${encodeURIComponent(leaderMagic)}`;
      const memberLabel = displayName(member);

      if (wantsEmail(leader)) {
        const rangesHtml = lines.map((line) => `<li>${escapeForHtml(line)}</li>`).join('');
        const inner = `
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${escapeForHtml(memberLabel)}</strong> submitted a leave request.</p>
          <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
            <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;"><ul style="margin:0;padding-left:18px;">${rangesHtml}</ul></td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(reason)}</td></tr>
          </table>
          <p style="margin:20px 0 0;">
            <a href="${leaderLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review requests</a>
          </p>
        `;
        tasks.push(
          sendHtmlEmail({
            to: leader.email!.trim(),
            subject: `New leave request from ${memberLabel} — ${singleLine}`,
            html: shell(inner, {
              title: 'New leave request',
              preheader: `${memberLabel} · ${singleLine}`,
            }),
          })
        );
      }

      if (wantsTelegram(leader)) {
        const rangeLines = lines.map((line) => `- ${line}`).join('\n');
        tasks.push(
          sendTelegramMessage({
            chatId: leader.telegramUserId!,
            text:
              `New leave request\n` +
              `From: ${memberLabel}\n` +
              `Dates:\n${rangeLines}\n` +
              `Reason: ${reason}`,
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
  const magic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: '/member/requests',
  });
  const link = `${base}/api/auth/magic?token=${encodeURIComponent(magic)}`;

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
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
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

function leaveDateRange(leaveRequest: LeaveRequest): string {
  const start = leaveRequest.startDate instanceof Date
    ? leaveRequest.startDate.toISOString().split('T')[0]
    : String(leaveRequest.startDate);
  const end = leaveRequest.endDate instanceof Date
    ? leaveRequest.endDate.toISOString().split('T')[0]
    : String(leaveRequest.endDate);
  return formatDateRange(start, end);
}

/** Reminder that approved leave starts in `daysUntil` calendar days (per user timezone on cron). */
export async function notifyLeaveApproachingReminder(params: {
  leaveRequest: LeaveRequest;
  member: User;
  teamName: string;
  daysUntil: number;
}): Promise<void> {
  const { leaveRequest, member, teamName, daysUntil } = params;
  const range = leaveDateRange(leaveRequest);
  const base = appBaseUrl();
  const magic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: member.role === 'leader' ? '/leader/calendar' : '/member/requests',
  });
  const link = `${base}/api/auth/magic?token=${encodeURIComponent(magic)}`;
  const when =
    daysUntil === 1
      ? 'Your approved leave starts tomorrow.'
      : `Your approved leave starts in ${daysUntil} days.`;

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(member)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
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
        subject: `Leave reminder: starts in ${daysUntil} day${daysUntil === 1 ? '' : 's'} — ${range}`,
        html: shell(inner, {
          title: `Leave in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
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
          `Leave reminder (${daysUntil} day${daysUntil === 1 ? '' : 's'})\n` +
          `${when}\n` +
          `Team: ${teamName}\n` +
          `Dates: ${range}\n` +
          `Reason: ${leaveRequest.reason}`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

/** Leader heads-up: teammate's approved leave starts in `daysUntil` days. */
export async function notifyLeaderTeamLeaveApproaching(params: {
  leaveRequest: LeaveRequest;
  leader: User;
  member: User;
  teamName: string;
  daysUntil: number;
}): Promise<void> {
  const { leaveRequest, leader, member, teamName, daysUntil } = params;
  const range = leaveDateRange(leaveRequest);
  const base = appBaseUrl();
  const leaderMagic = await createSingleUseMagicLinkToken({
    userId: String(leader._id),
    nextPath: '/leader/calendar',
  });
  const leaderLink = `${base}/api/auth/magic?token=${encodeURIComponent(leaderMagic)}`;
  const memberLabel = displayName(member);
  const when =
    daysUntil === 1
      ? `${escapeForHtml(memberLabel)}'s leave starts tomorrow.`
      : `${escapeForHtml(memberLabel)}'s leave starts in ${daysUntil} days.`;

  const tasks: Promise<unknown>[] = [];

  if (wantsEmail(leader)) {
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Team planning reminder</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${when}</strong></p>
      <table role="presentation" style="margin:16px 0;border-collapse:collapse;width:100%;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Team</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(teamName)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Member</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(memberLabel)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${escapeForHtml(range)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px 0;font-size:14px;">${escapeForHtml(leaveRequest.reason)}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${leaderLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Open calendar</a>
      </p>
    `;
    tasks.push(
      sendHtmlEmail({
        to: leader.email!.trim(),
        subject: `Team leave in ${daysUntil} day${daysUntil === 1 ? '' : 's'} — ${memberLabel} — ${range}`,
        html: shell(inner, {
          title: 'Team leave reminder',
          preheader: `${memberLabel} · ${range}`,
        }),
      })
    );
  }

  if (wantsTelegram(leader)) {
    const line =
      daysUntil === 1
        ? `Team reminder: ${memberLabel}'s leave starts tomorrow`
        : `Team reminder: ${memberLabel}'s leave in ${daysUntil} days`;
    tasks.push(
      sendTelegramMessage({
        chatId: leader.telegramUserId!,
        text: `${line}\nTeam: ${teamName}\nDates: ${range}\nReason: ${leaveRequest.reason}`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

export type LeaveRemovedKind = 'member_withdrew_pending' | 'leader_removed_approved';

/** After soft-delete: notify member and optionally leader (skipped if leave already ended by calendar). */
export async function notifyLeaveRemoved(params: {
  leaveRequest: LeaveRequest;
  member: User;
  leader: User | null;
  actor: User;
  teamName: string;
  kind: LeaveRemovedKind;
}): Promise<void> {
  const { leaveRequest, member, leader, actor, teamName, kind } = params;
  const range = leaveDateRange(leaveRequest);
  const memberLabel = displayName(member);
  const actorLabel = displayName(actor);
  const base = appBaseUrl();
  const memberMagic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: '/member/requests',
  });
  const memberLink = `${base}/api/auth/magic?token=${encodeURIComponent(memberMagic)}`;
  const leaderLink =
    leader?._id
      ? `${base}/api/auth/magic?token=${encodeURIComponent(
          await createSingleUseMagicLinkToken({
            userId: String(leader._id),
            nextPath: '/leader/requests',
          })
        )}`
      : `${base}/leader/requests`;

  const tasks: Promise<unknown>[] = [];

  if (kind === 'member_withdrew_pending') {
    const memberSubject = `Leave request withdrawn — ${range}`;
    const memberBody = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Your <strong>pending</strong> leave request (${escapeForHtml(range)}) was removed.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">Team: ${escapeForHtml(teamName)}</p>
      <p style="margin:20px 0 0;">
        <a href="${memberLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View requests</a>
      </p>
    `;
    if (wantsEmail(member)) {
      tasks.push(
        sendHtmlEmail({
          to: member.email!.trim(),
          subject: memberSubject,
          html: shell(memberBody, { title: 'Request withdrawn', preheader: range }),
        })
      );
    }
    if (wantsTelegram(member)) {
      tasks.push(
        sendTelegramMessage({
          chatId: member.telegramUserId!,
          text: `Pending leave withdrawn\nDates: ${range}\nTeam: ${teamName}`,
        })
      );
    }

    if (leader && leader._id && String(leader._id) !== String(member._id)) {
      const subj = `${memberLabel} withdrew a pending leave — ${range}`;
      const inner = `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${escapeForHtml(memberLabel)}</strong> removed a pending leave request.</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#334155;">Dates: ${escapeForHtml(range)}</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">Reason: ${escapeForHtml(leaveRequest.reason)}</p>
        <p style="margin:20px 0 0;">
          <a href="${leaderLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review requests</a>
        </p>
      `;
      if (wantsEmail(leader)) {
        tasks.push(
          sendHtmlEmail({
            to: leader.email!.trim(),
            subject: subj,
            html: shell(inner, { title: 'Pending leave withdrawn', preheader: range }),
          })
        );
      }
      if (wantsTelegram(leader)) {
        tasks.push(
          sendTelegramMessage({
            chatId: leader.telegramUserId!,
            text: `Pending leave withdrawn\nFrom: ${memberLabel}\nDates: ${range}`,
          })
        );
      }
    }
  } else {
    const subj = `Approved leave removed — ${range}`;
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Your <strong>approved</strong> leave (${escapeForHtml(range)}) was removed by ${escapeForHtml(actorLabel)}.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">Team: ${escapeForHtml(teamName)}</p>
      <p style="margin:20px 0 0;">
        <a href="${memberLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View requests</a>
      </p>
    `;
    if (wantsEmail(member)) {
      tasks.push(
        sendHtmlEmail({
          to: member.email!.trim(),
          subject: subj,
          html: shell(inner, { title: 'Leave removed', preheader: range }),
        })
      );
    }
    if (wantsTelegram(member)) {
      tasks.push(
        sendTelegramMessage({
          chatId: member.telegramUserId!,
          text: `Approved leave removed by ${actorLabel}\nDates: ${range}\nTeam: ${teamName}`,
        })
      );
    }
  }

  await Promise.allSettled(tasks);
}

export async function notifyLeaveRemovedBulk(params: {
  member: User;
  leader: User | null;
  teamName: string;
  ranges: string[];
}): Promise<void> {
  const { member, leader, teamName, ranges } = params;
  if (ranges.length === 0) return;

  const base = appBaseUrl();
  const memberMagic = await createSingleUseMagicLinkToken({
    userId: String(member._id),
    nextPath: '/member/requests',
  });
  const memberLink = `${base}/api/auth/magic?token=${encodeURIComponent(memberMagic)}`;
  const rangeList = ranges.map((r) => `<li style="margin:0 0 4px;">${escapeForHtml(r)}</li>`).join('');
  const rangeText = ranges.join(', ');
  const summary = `${ranges.length} pending leave request${ranges.length !== 1 ? 's' : ''} cancelled`;

  const tasks: Promise<unknown>[] = [];

  const memberBody = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">Hi ${escapeForHtml(greetingName(member))},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">You cancelled <strong>${ranges.length}</strong> pending leave request${ranges.length !== 1 ? 's' : ''}:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#334155;">${rangeList}</ul>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">Team: ${escapeForHtml(teamName)}</p>
    <p style="margin:20px 0 0;">
      <a href="${memberLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">View requests</a>
    </p>
  `;
  if (wantsEmail(member)) {
    tasks.push(
      sendHtmlEmail({
        to: member.email!.trim(),
        subject: `${summary} — ${teamName}`,
        html: shell(memberBody, { title: 'Requests cancelled', preheader: summary }),
      })
    );
  }
  if (wantsTelegram(member)) {
    tasks.push(
      sendTelegramMessage({
        chatId: member.telegramUserId!,
        text: `${summary}\nDates: ${rangeText}\nTeam: ${teamName}`,
      })
    );
  }

  if (leader && leader._id && String(leader._id) !== String(member._id)) {
    const memberLabel = displayName(member);
    const leaderMagic = await createSingleUseMagicLinkToken({
      userId: String(leader._id),
      nextPath: '/leader/requests',
    });
    const leaderLink = `${base}/api/auth/magic?token=${encodeURIComponent(leaderMagic)}`;
    const leaderBody = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;"><strong>${escapeForHtml(memberLabel)}</strong> cancelled ${ranges.length} pending leave request${ranges.length !== 1 ? 's' : ''}:</p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#334155;">${rangeList}</ul>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">Team: ${escapeForHtml(teamName)}</p>
      <p style="margin:20px 0 0;">
        <a href="${leaderLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review requests</a>
      </p>
    `;
    if (wantsEmail(leader)) {
      tasks.push(
        sendHtmlEmail({
          to: leader.email!.trim(),
          subject: `${memberLabel} cancelled ${ranges.length} pending request${ranges.length !== 1 ? 's' : ''} — ${teamName}`,
          html: shell(leaderBody, { title: 'Requests cancelled', preheader: `${memberLabel} · ${summary}` }),
        })
      );
    }
    if (wantsTelegram(leader)) {
      tasks.push(
        sendTelegramMessage({
          chatId: leader.telegramUserId!,
          text: `${memberLabel} cancelled ${ranges.length} pending leave request${ranges.length !== 1 ? 's' : ''}\nDates: ${rangeText}\nTeam: ${teamName}`,
        })
      );
    }
  }

  await Promise.allSettled(tasks);
}
