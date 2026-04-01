/**
 * Curated IANA zones for profile selection (browser + Node Intl).
 * UTC first; remainder sorted by UTC offset then alphabetically.
 */
const ZONES = [
  'UTC',
  // UTC-12 to UTC-8
  'Pacific/Honolulu',
  'America/Anchorage',
  // UTC-8 to UTC-6
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Denver',
  'America/Mexico_City',
  // UTC-5 to UTC-4
  'America/Chicago',
  'America/Bogota',
  'America/New_York',
  'America/Toronto',
  // UTC-3
  'America/Sao_Paulo',
  // UTC-1/0
  'Atlantic/Azores',
  // UTC+0
  'Africa/Abidjan',
  'Africa/Accra',
  'Africa/Dakar',
  'Europe/London',
  // UTC+1
  'Africa/Algiers',
  'Africa/Casablanca',
  'Africa/Lagos',
  'Africa/Luanda',
  'Africa/Tunis',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  // UTC+2
  'Africa/Cairo',
  'Africa/Harare',
  'Africa/Johannesburg',
  'Africa/Lusaka',
  'Africa/Maputo',
  'Africa/Tripoli',
  'Europe/Athens',
  // UTC+3
  'Africa/Addis_Ababa',
  'Africa/Dar_es_Salaam',
  'Africa/Khartoum',
  'Africa/Nairobi',
  'Asia/Baghdad',
  'Europe/Moscow',
  // UTC+4
  'Asia/Dubai',
  // UTC+5 to UTC+6
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  // UTC+7 to UTC+8
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Hong_Kong',
  'Asia/Manila',
  'Asia/Shanghai',
  'Asia/Singapore',
  // UTC+9
  'Asia/Seoul',
  'Asia/Tokyo',
  // UTC+10 to UTC+12
  'Australia/Perth',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Fiji',
] as const;

export const PROFILE_TIMEZONES: readonly string[] = [...ZONES];
