import { NextRequest, NextResponse } from 'next/server';
import { runLeaveApproachingReminders } from '@/services/leaveReminderService';
import { info, error as logError } from '@/lib/logger';

/**
 * Daily cron: remind members of approved leave starting in 10 and 5 days (UTC calendar days).
 *
 * Vercel Cron: set CRON_SECRET in project env; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * Manual: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/leave-reminders
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
