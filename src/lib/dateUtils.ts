/**
 * Parse dates in a timezone-safe way
 * This prevents timezone shifts when parsing ISO date strings
 * Normalizes dates to local midnight to avoid day shifts
 * 
 * This is especially important for users in timezones ahead of UTC (like Zambia, UTC+2)
 * where UTC midnight dates can appear as the next day when parsed
 */
export const parseDateSafe = (dateInput: string | Date): Date => {
  if (dateInput instanceof Date) {
    // If already a Date, normalize to local midnight
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  
  const date = new Date(dateInput);
  // Normalize to local midnight to avoid timezone shifts
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

