'use client';

import { PROFILE_TIMEZONES } from '@/lib/profileTimezones';

type Props = {
  id?: string;
  value: string;
  onChange: (timeZone: string) => void;
  disabled?: boolean;
  className?: string;
};

function labelForZone(zone: string): string {
  if (zone === 'UTC') return '(UTC+0) UTC';
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const offset = offsetStr.replace('GMT', 'UTC') || 'UTC';
    const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone;
    return `(${offset}) ${city}`;
  } catch {
    return zone.replace(/_/g, ' ');
  }
}

export default function TimezoneSelect({ id, value, onChange, disabled, className }: Props) {
  const inList = PROFILE_TIMEZONES.includes(value);
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400'
      }
    >
      {!inList && value ? (
        <option value={value}>{labelForZone(value)}</option>
      ) : null}
      {PROFILE_TIMEZONES.map((zone) => (
        <option key={zone} value={zone}>
          {labelForZone(zone)}
        </option>
      ))}
    </select>
  );
}
