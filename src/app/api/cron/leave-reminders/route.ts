import { NextRequest, NextResponse } from 'next/server';
import { runLeaveApproachingReminders } from '@/services/leaveReminderService';
import { info, error as logError } from '@/lib/logger';

/**
 * Hourly cron: upcoming approved leave — reminders to the member (per their profile offsets) and
 * to the team leader about teammates’ leave (per leader profile offsets). Defaults include 5 and 1 days before.
 * Each reminder fires only during the recipient’s preferred local hour (leaveReminderTimeLocal, default 09:00).
 *
 * Trigger hourly via cron-job.org (or similar) — bypasses Vercel Hobby 1-cron-per-day limit.
 * Set CRON_SECRET in Vercel env vars; pass as: Authorization: Bearer <CRON_SECRET>
 * URL: https://your-app.vercel.app/api/cron/leave-reminders
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'CRON_SECRET is required in production' },
        { status: 500 }
      );
    } else {
      info('[cron/leave-reminders] CRON_SECRET unset — allowing run in non-production only');
    }

    const summary = await runLeaveApproachingReminders(new Date());
    info('[cron/leave-reminders] completed', summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    logError('[cron/leave-reminders] error', e);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
