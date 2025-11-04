import { ShiftSchedule } from '@/types';

// Function to check if a date is a working day for a user
export const isWorkingDay = (date: Date, shiftSchedule: ShiftSchedule): boolean => {
  if (!shiftSchedule) return true; // Default to all days if no schedule
  
  if (shiftSchedule.type === 'rotating') {
    // For rotating shifts, calculate days since start date
    const startDate = new Date(shiftSchedule.startDate);
    const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Use modulo to find position in the rotation pattern
    const patternIndex = daysDiff % shiftSchedule.pattern.length;
    
    // Handle negative days (dates before start date)
    const adjustedIndex = patternIndex < 0 ? patternIndex + shiftSchedule.pattern.length : patternIndex;
    
    return shiftSchedule.pattern[adjustedIndex] || false;
  } else {
    // For fixed schedules, use day of week
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Convert to 0-based index where 0 = Monday
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    return shiftSchedule.pattern[adjustedDay] || false;
  }
};

// Function to get working days between two dates
export const getWorkingDays = (startDate: Date, endDate: Date, shiftSchedule: ShiftSchedule): Date[] => {
  const workingDays: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    if (isWorkingDay(current, shiftSchedule)) {
      workingDays.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
};

// Function to count working days between two dates
export const countWorkingDays = (startDate: Date, endDate: Date, shiftSchedule: ShiftSchedule): number => {
  return getWorkingDays(startDate, endDate, shiftSchedule).length;
};

// Function to calculate leave balance for a user
export const calculateLeaveBalance = (
  maxLeavePerYear: number,
  approvedRequests: Array<{ startDate: Date; endDate: Date }>,
  shiftSchedule: ShiftSchedule,
  manualLeaveBalance?: number,
  manualYearToDateUsed?: number
): number => {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(currentYear, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);
  
  // Calculate approved working days for the current year only
  // Include requests that overlap with the current year, but only count days within the year
  const approvedWorkingDays = approvedRequests.reduce((total, req) => {
    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    
    // Check if request overlaps with current year
    // Request overlaps if: (start <= yearEnd) AND (end >= yearStart)
    if (reqStart <= yearEnd && reqEnd >= yearStart) {
      // Calculate the overlap period within the current year
      const overlapStart = reqStart > yearStart ? reqStart : yearStart;
      const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
      
      // Count working days only for the overlap period
      const workingDays = countWorkingDays(overlapStart, overlapEnd, shiftSchedule);
      return total + workingDays;
    }
    
    return total;
  }, 0);

  // Simplified base balance logic:
  // - If manualLeaveBalance is set, always use it as base (whether above or below maxLeavePerYear)
  // - If manualLeaveBalance is not set, use maxLeavePerYear
  const baseBalance = manualLeaveBalance !== undefined ? manualLeaveBalance : maxLeavePerYear;
  
  // If manualYearToDateUsed is set, use it instead of calculated approved working days
  const daysUsed = manualYearToDateUsed !== undefined ? manualYearToDateUsed : approvedWorkingDays;
  const remainingBalance = baseBalance - daysUsed;
  
  // Debug logging for specific cases
  if (manualLeaveBalance !== undefined && approvedRequests.length > 0 && approvedWorkingDays === 0) {
    console.log(`[DEBUG calculateLeaveBalance] baseBalance=${baseBalance}, approvedRequests=${approvedRequests.length}, approvedWorkingDays=${approvedWorkingDays}, remainingBalance=${remainingBalance}`);
    approvedRequests.forEach((req, idx) => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      console.log(`  Request ${idx + 1}: ${reqStart.toISOString()} to ${reqEnd.toISOString()}, overlaps=${reqStart <= yearEnd && reqEnd >= yearStart}`);
    });
  }
  
  return remainingBalance;
};

// Function to calculate surplus balance (when manual balance exceeds team max)
export const calculateSurplusBalance = (
  manualLeaveBalance: number | undefined,
  maxLeavePerYear: number
): number => {
  if (manualLeaveBalance === undefined) {
    return 0;
  }
  
  // Surplus is the amount by which manual balance exceeds team max
  return manualLeaveBalance > maxLeavePerYear ? manualLeaveBalance - maxLeavePerYear : 0;
};
