/**
 * Curated IANA zones for profile selection (browser + Node Intl).
 * UTC first; remainder sorted alphabetically by identifier.
 */
const ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Lusaka',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Honolulu',
] as const;

const withoutUtc = [...ZONES].filter((z) => z !== 'UTC').sort((a, b) => a.localeCompare(b));

export const PROFILE_TIMEZONES: readonly string[] = ['UTC', ...withoutUtc];
