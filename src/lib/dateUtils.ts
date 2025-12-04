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

/**
 * Format a date as YYYY-MM-DD using local timezone components
 * This prevents timezone shifts when formatting dates for API requests
 * 
 * Example: In Zambia (UTC+2), a Date for Jan 22nd local time should format as "2026-01-22"
 * not "2026-01-21" (which would happen with toISOString().split('T')[0])
 */
export const formatDateSafe = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

