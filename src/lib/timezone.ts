/**
 * Per-user IANA timezone helpers for calendar-based logic (e.g. leave reminders).
 */

export function resolveUserTimeZone(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return 'UTC';
  const t = raw.trim();
  if (!t) return 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return t;
  } catch {
    return 'UTC';
  }
}

function ymdInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Whole calendar days from the member's "today" until their calendar date of `startDate`,
 * both interpreted in `timeZone` (IANA). Matches how people read dates on leave requests.
 */
export function calendarDaysUntilLeaveStartInZone(
  startDate: Date,
  now: Date,
  rawTimeZone: string | null | undefined
): number {
  const timeZone = resolveUserTimeZone(rawTimeZone);
  const todayYmd = ymdInZone(now, timeZone);
  const startYmd = ymdInZone(startDate, timeZone);
  const [y1, m1, d1] = todayYmd.split('-').map(Number);
  const [y2, m2, d2] = startYmd.split('-').map(Number);
  const t0 = Date.UTC(y1, m1 - 1, d1);
  const t1 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t0) / 86400000);
}
