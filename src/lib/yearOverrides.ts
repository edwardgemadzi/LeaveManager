import { User } from '@/types';

export function getEffectiveManualYearToDateUsed(
  user: User,
  targetYear: number = new Date().getFullYear()
): number | undefined {
  if (user.manualYearToDateUsed === undefined) {
    return undefined;
  }

  // Legacy values without a year are treated as current-year overrides.
  if (user.manualYearToDateUsedYear === undefined) {
    return user.manualYearToDateUsed;
  }

  return user.manualYearToDateUsedYear === targetYear
    ? user.manualYearToDateUsed
    : undefined;
}

