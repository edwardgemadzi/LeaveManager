import { Team, TeamSettings } from '@/types';
import { parseDateSafe } from './dateUtils';

type BypassWindow = {
  enabled: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
};

type BypassSettings = {
  bypassNoticePeriod?: BypassWindow;
};

type SettingsSource = Team | TeamSettings | { settings: TeamSettings } | BypassSettings | { settings?: BypassSettings };

const getBypassSettings = (source: SettingsSource): BypassWindow | undefined => {
  if ('settings' in source) {
    return source.settings?.bypassNoticePeriod;
  }
  return (source as BypassSettings).bypassNoticePeriod;
};

// Check if bypass notice period is active for a given team/settings and date
export const isBypassNoticePeriodActive = (
  source: SettingsSource,
  date: Date = new Date()
): boolean => {
  const bypass = getBypassSettings(source);
  if (!bypass?.enabled) {
    return false;
  }

  if (!bypass.startDate || !bypass.endDate) {
    return false;
  }

  const checkDate = parseDateSafe(date);
  const startDate = parseDateSafe(bypass.startDate);
  const endDate = parseDateSafe(bypass.endDate);

  checkDate.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return checkDate >= startDate && checkDate <= endDate;
};

