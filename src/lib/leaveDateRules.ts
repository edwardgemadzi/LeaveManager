import { TeamSettings } from '@/types';

function toDateOnly(input: string): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function validateLeaveDatesAgainstTeamPolicy(params: {
  settings: TeamSettings;
  startDate: string;
  endDate: string;
}): string | null {
  const start = toDateOnly(params.startDate);
  const end = toDateOnly(params.endDate);
  const days = dateRange(start, end);
  const blackoutDates = params.settings.blackoutDates || [];

  for (const blackout of blackoutDates) {
    const bStart = toDateOnly(blackout.startDate);
    const bEnd = toDateOnly(blackout.endDate);
    if (days.some((d) => d >= bStart && d <= bEnd)) {
      return `Selected dates overlap blackout period: ${blackout.name}`;
    }
  }

  if (params.settings.enforceHolidayBlocking) {
    const holidaySet = new Set((params.settings.holidays || []).map((h) => h.date));
    const blocked = days.find((d) => holidaySet.has(dateKey(d)));
    if (blocked) {
      return `Selected dates include blocked holiday ${dateKey(blocked)}`;
    }
  }

  return null;
}

