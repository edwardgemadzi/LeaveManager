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

// Helper function to check if a leave request is maternity leave
export const isMaternityLeave = (reason: string): boolean => {
  if (!reason) return false;
  const lowerReason = reason.toLowerCase();
  return lowerReason === 'maternity' || lowerReason.includes('maternity') || lowerReason.includes('paternity');
};

// Function to count maternity leave days based on counting method
export const countMaternityLeaveDays = (
  startDate: Date,
  endDate: Date,
  countingMethod: 'calendar' | 'working',
  shiftSchedule?: ShiftSchedule
): number => {
  if (countingMethod === 'calendar') {
    // Count all calendar days (ignores working days)
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  } else {
    // Count only working days (default)
    if (!shiftSchedule) {
      // If no shift schedule, count all days
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return countWorkingDays(startDate, endDate, shiftSchedule);
  }
};

// Function to calculate leave balance for a user
export const calculateLeaveBalance = (
  maxLeavePerYear: number,
  approvedRequests: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  shiftSchedule: ShiftSchedule,
  manualLeaveBalance?: number,
  manualYearToDateUsed?: number
): number => {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(currentYear, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);
  
  // Filter out maternity leave requests from regular leave calculations
  const nonMaternityRequests = approvedRequests.filter(req => {
    if (!req.reason) return true;
    return !isMaternityLeave(req.reason);
  });
  
  // Calculate approved working days for the current year only
  // Count all approved days in the year (including future approved dates)
  // because approved requests are already committed/allocated
  const approvedWorkingDays = nonMaternityRequests.reduce((total, req) => {
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
      
      // Count working days only for the overlap period (includes future approved dates)
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

// Function to calculate maternity leave balance for a user
export const calculateMaternityLeaveBalance = (
  maxMaternityLeaveDays: number,
  approvedMaternityRequests: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  countingMethod: 'calendar' | 'working',
  shiftSchedule?: ShiftSchedule,
  manualMaternityLeaveBalance?: number,
  manualMaternityYearToDateUsed?: number
): number => {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(currentYear, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);
  
  // Filter to only maternity leave requests
  const maternityRequests = approvedMaternityRequests.filter(req => {
    if (!req.reason) return false;
    return isMaternityLeave(req.reason);
  });
  
  // Calculate approved days for the current year only
  // Include requests that overlap with the current year, but only count days within the year
  const approvedDays = maternityRequests.reduce((total, req) => {
    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    
    // Check if request overlaps with current year
    if (reqStart <= yearEnd && reqEnd >= yearStart) {
      // Calculate the overlap period within the current year
      const overlapStart = reqStart > yearStart ? reqStart : yearStart;
      const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
      
      // Count days based on counting method
      const days = countMaternityLeaveDays(overlapStart, overlapEnd, countingMethod, shiftSchedule);
      return total + days;
    }
    
    return total;
  }, 0);

  // Base balance logic:
  // - If manualMaternityLeaveBalance is set, always use it as base
  // - If manualMaternityLeaveBalance is not set, use maxMaternityLeaveDays
  const baseBalance = manualMaternityLeaveBalance !== undefined ? manualMaternityLeaveBalance : maxMaternityLeaveDays;
  
  // If manualMaternityYearToDateUsed is set, use it instead of calculated days
  const daysUsed = manualMaternityYearToDateUsed !== undefined ? manualMaternityYearToDateUsed : approvedDays;
  const remainingBalance = baseBalance - daysUsed;
  
  return remainingBalance;
};

// Function to calculate surplus maternity leave balance (when manual balance exceeds team max)
export const calculateMaternitySurplusBalance = (
  manualMaternityLeaveBalance: number | undefined,
  maxMaternityLeaveDays: number
): number => {
  if (manualMaternityLeaveBalance === undefined) {
    return 0;
  }
  
  // Surplus is the amount by which manual balance exceeds team max
  return manualMaternityLeaveBalance > maxMaternityLeaveDays ? manualMaternityLeaveBalance - maxMaternityLeaveDays : 0;
};
