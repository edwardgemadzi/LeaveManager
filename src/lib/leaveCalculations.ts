import { ShiftSchedule, User } from '@/types';
import { parseDateSafe } from '@/lib/dateUtils';

// Helper function to get the correct shift schedule for a given date
// Checks historical shifts and returns the schedule that was active on that date
export const getShiftScheduleForDate = (user: User, date: Date): ShiftSchedule | undefined => {
  if (!user.shiftSchedule) return undefined;
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  // Check if date is in the past and user has shift history
  if (user.shiftHistory && user.shiftHistory.length > 0) {
    // Find the historical shift that was active on this date
    // A shift is active if: startDate <= date <= endDate
    for (const historicalShift of user.shiftHistory) {
      // Handle both Date objects and ISO strings from JSON
      const startDate = parseDateSafe(historicalShift.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = parseDateSafe(historicalShift.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      // Check if date is within the historical shift period
      // For dates before the historical shift start date but before the current shift start date,
      // we should still use the historical shift (with the rotation start date)
      const currentShiftStartDate = user.shiftSchedule?.startDate ? parseDateSafe(user.shiftSchedule.startDate) : null;
      const isBeforeHistoricalStart = checkDate < startDate;
      const isBeforeCurrentShift = currentShiftStartDate && checkDate < currentShiftStartDate;
      
      if (checkDate >= startDate && checkDate <= endDate) {
        // Date is within the historical shift period
        return {
          pattern: historicalShift.pattern,
          startDate: historicalShift.startDate,
          type: historicalShift.type
        };
      } else if (isBeforeHistoricalStart && isBeforeCurrentShift) {
        // Date is before historical shift start but before current shift start
        // Use historical shift with its rotation start date
        return {
          pattern: historicalShift.pattern,
          startDate: historicalShift.startDate,
          type: historicalShift.type
        };
      }
    }
  }
  
  // If no historical shift matches, use current schedule
  // Also use current schedule if date is today or in the future
  return user.shiftSchedule;
};

// Function to check if a date is a working day for a user
// Overload 1: Accepts User object (uses historical schedules for past dates)
export function isWorkingDay(date: Date, user: User): boolean;
// Overload 2: Accepts ShiftSchedule directly (backward compatibility)
export function isWorkingDay(date: Date, shiftSchedule: ShiftSchedule): boolean;
// Implementation
export function isWorkingDay(date: Date, userOrSchedule: User | ShiftSchedule): boolean {
  let shiftSchedule: ShiftSchedule | undefined;
  
  // Check if first parameter is User or ShiftSchedule
  if ('shiftSchedule' in userOrSchedule) {
    // It's a User object
    shiftSchedule = getShiftScheduleForDate(userOrSchedule, date);
  } else {
    // It's a ShiftSchedule - check if it has the required properties
    if ('pattern' in userOrSchedule && 'startDate' in userOrSchedule && 'type' in userOrSchedule) {
      shiftSchedule = userOrSchedule;
    } else {
      shiftSchedule = undefined;
    }
  }
  
  if (!shiftSchedule) return true; // Default to all days if no schedule
  
  if (shiftSchedule.type === 'rotating') {
    // For rotating shifts, calculate days since start date
    const startDate = parseDateSafe(shiftSchedule.startDate);
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
// Overload 1: Accepts User object (uses historical schedules for past dates)
export function getWorkingDays(startDate: Date, endDate: Date, user: User): Date[];
// Overload 2: Accepts ShiftSchedule directly (backward compatibility)
export function getWorkingDays(startDate: Date, endDate: Date, shiftSchedule: ShiftSchedule): Date[];
// Implementation
export function getWorkingDays(startDate: Date, endDate: Date, userOrSchedule: User | ShiftSchedule): Date[] {
  const workingDays: Date[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    // Type guard to determine if it's a User or ShiftSchedule
    if ('shiftSchedule' in userOrSchedule) {
      // It's a User object - use historical schedules
      if (isWorkingDay(current, userOrSchedule as User)) {
        workingDays.push(new Date(current));
      }
    } else {
      // It's a ShiftSchedule - use directly
      if (isWorkingDay(current, userOrSchedule as ShiftSchedule)) {
        workingDays.push(new Date(current));
      }
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}

// Function to count working days between two dates
// Overload 1: Accepts User object (uses historical schedules for past dates)
export function countWorkingDays(startDate: Date, endDate: Date, user: User): number;
// Overload 2: Accepts ShiftSchedule directly (backward compatibility)
export function countWorkingDays(startDate: Date, endDate: Date, shiftSchedule: ShiftSchedule): number;
// Implementation
export function countWorkingDays(startDate: Date, endDate: Date, userOrSchedule: User | ShiftSchedule): number {
  // Type guard to determine if it's a User or ShiftSchedule
  if ('shiftSchedule' in userOrSchedule) {
    return getWorkingDays(startDate, endDate, userOrSchedule as User).length;
  } else {
    return getWorkingDays(startDate, endDate, userOrSchedule as ShiftSchedule).length;
  }
}

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

// Function to calculate leave balance for a user.
// Source of truth: User from database (carryoverFromPreviousYear, carryoverExpiryDate) and approved leave requests.
// Same logic for every user; if it's wrong for one, it's wrong for all.
// Overload 1: Accepts User object (uses historical schedules for past dates)
export function calculateLeaveBalance(
  maxLeavePerYear: number,
  approvedRequests: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  user: User,
  manualLeaveBalance?: number,
  manualYearToDateUsed?: number,
  carryoverSettings?: { limitedToMonths?: number[] }
): number;
// Overload 2: Accepts ShiftSchedule directly (backward compatibility)
export function calculateLeaveBalance(
  maxLeavePerYear: number,
  approvedRequests: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  shiftSchedule: ShiftSchedule,
  manualLeaveBalance?: number,
  manualYearToDateUsed?: number,
  carryoverSettings?: { limitedToMonths?: number[] }
): number;
// Implementation
export function calculateLeaveBalance(
  maxLeavePerYear: number,
  approvedRequests: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  userOrSchedule: User | ShiftSchedule,
  manualLeaveBalance?: number,
  manualYearToDateUsed?: number,
  carryoverSettings?: { limitedToMonths?: number[] }
): number {
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
      // Use User object to support historical schedules for past dates
      // Type guard to determine if it's a User or ShiftSchedule
      const workingDays = ('shiftSchedule' in userOrSchedule)
        ? countWorkingDays(overlapStart, overlapEnd, userOrSchedule as User)
        : countWorkingDays(overlapStart, overlapEnd, userOrSchedule as ShiftSchedule);
      return total + workingDays;
    }
    
    return total;
    }, 0);

  // New year base balance logic:
  // - If manualLeaveBalance is set, always use it as base (whether above or below maxLeavePerYear)
  // - If manualLeaveBalance is not set, use maxLeavePerYear
  const newYearBalance = manualLeaveBalance !== undefined ? manualLeaveBalance : maxLeavePerYear;
  
  // Get carryover from previous year if exists and not expired
  // Only check if userOrSchedule is a User object (has carryoverFromPreviousYear field)
  let carryoverAvailable = 0;
  let originalCarryover = 0; // Used when expired: still attribute past usage to carryover so annual is not double-counted
  let isCarryoverExpired = false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if ('carryoverFromPreviousYear' in userOrSchedule && userOrSchedule.carryoverFromPreviousYear) {
    isCarryoverExpired = !!(userOrSchedule.carryoverExpiryDate &&
      new Date(userOrSchedule.carryoverExpiryDate).setHours(0, 0, 0, 0) < today.getTime());
    originalCarryover = userOrSchedule.carryoverFromPreviousYear;
    // Only count carryover as available (for remaining balance) if it hasn't expired
    if (!isCarryoverExpired && originalCarryover > 0) {
      carryoverAvailable = originalCarryover;
    }
  }
  
  // Helper function to calculate working days for a date range within allowed months
  const calculateWorkingDaysInAllowedMonths = (
    startDate: Date,
    endDate: Date,
    allowedMonths: number[],
    schedule: User | ShiftSchedule
  ): number => {
    let totalDays = 0;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    // Iterate through each month that overlaps with the date range
    const currentMonthStart = new Date(start);
    currentMonthStart.setDate(1); // Start of the month containing the start date
    currentMonthStart.setHours(0, 0, 0, 0);
    
    // Calculate the last month that overlaps with the date range
    const lastMonthStart = new Date(end);
    lastMonthStart.setDate(1);
    lastMonthStart.setHours(0, 0, 0, 0);
    
    // Iterate through each month from start to end
    const currentMonth = new Date(currentMonthStart);
    
    while (currentMonth <= lastMonthStart) {
      const monthIndex = currentMonth.getMonth();
      
      if (allowedMonths.includes(monthIndex)) {
        // This month is allowed - calculate working days for the portion of the request in this month
        const monthStart = new Date(Math.max(start.getTime(), currentMonth.getTime()));
        monthStart.setHours(0, 0, 0, 0);
        
        // Last day of current month
        const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        const monthEndActual = new Date(Math.min(end.getTime(), monthEnd.getTime()));
        
        if (monthStart <= monthEndActual) {
          const workingDays = ('shiftSchedule' in schedule)
            ? countWorkingDays(monthStart, monthEndActual, schedule as User)
            : countWorkingDays(monthStart, monthEndActual, schedule as ShiftSchedule);
          totalDays += workingDays;
        }
      }
      
      // Move to next month
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    
    return totalDays;
  };

  // Calculate days used, splitting by month if carryover is limited to specific months
  let daysUsedInAllowedMonths = 0;
  let daysUsedOutsideAllowedMonths = 0;

  if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0 && manualYearToDateUsed === undefined) {
    // Split requests by month: calculate working days separately for allowed months vs outside
    const allowedMonths = carryoverSettings.limitedToMonths;
    
    nonMaternityRequests.forEach(req => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      
      // Check if request overlaps with current year
      if (reqStart <= yearEnd && reqEnd >= yearStart) {
        const overlapStart = reqStart > yearStart ? reqStart : yearStart;
        const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
        
        // Calculate working days in allowed months
        const daysInAllowed = calculateWorkingDaysInAllowedMonths(
          overlapStart,
          overlapEnd,
          allowedMonths,
          userOrSchedule
        );
        daysUsedInAllowedMonths += daysInAllowed;
        
        // Calculate total working days for the request
        const totalDays = ('shiftSchedule' in userOrSchedule)
          ? countWorkingDays(overlapStart, overlapEnd, userOrSchedule as User)
          : countWorkingDays(overlapStart, overlapEnd, userOrSchedule as ShiftSchedule);
        
        // Days outside allowed months = total - days in allowed months
        daysUsedOutsideAllowedMonths += (totalDays - daysInAllowed);
      }
    });
    
  } else {
    // No month limit or manualYearToDateUsed is set: use current behavior
    const daysUsed = manualYearToDateUsed !== undefined ? manualYearToDateUsed : approvedWorkingDays;
    daysUsedInAllowedMonths = daysUsed;
    daysUsedOutsideAllowedMonths = 0;
  }

  // When carryover has expired we still use originalCarryover to decide how much to deduct from annual,
  // so that days already used from carryover (e.g. in January) do not also reduce annual.
  const effectiveCarryoverForDeduction = isCarryoverExpired ? originalCarryover : carryoverAvailable;

  // When carryover is limited to specific months (e.g. January only):
  // - Days IN allowed months: use carryover first; only excess deducts from annual.
  // - Days OUTSIDE allowed months: always deducted from regular annual leave (never from carryover).
  let remainingCarryover = 0;
  let remainingNewYearBalance = newYearBalance;

  if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0) {
    // When month limits are set:
    // 1. Days in allowed months: consume carryover first, when carryover finishes annual balance is deducted
    // 2. Days outside allowed months: consume annual balance directly
    if (daysUsedInAllowedMonths <= effectiveCarryoverForDeduction) {
      // All days in allowed months come from carryover
      remainingCarryover = isCarryoverExpired ? 0 : (carryoverAvailable - daysUsedInAllowedMonths);
      // Only days outside allowed months consume annual balance
      remainingNewYearBalance = newYearBalance - daysUsedOutsideAllowedMonths;
    } else {
      // Carryover exhausted for allowed months - annual balance is deducted for excess
      remainingCarryover = 0;
      const excessFromAllowedMonths = daysUsedInAllowedMonths - effectiveCarryoverForDeduction;
      remainingNewYearBalance = newYearBalance - (daysUsedOutsideAllowedMonths + excessFromAllowedMonths);
    }
  } else {
    // No month limit: consume carryover first, then new year balance
    if (daysUsedInAllowedMonths <= effectiveCarryoverForDeduction) {
      // All days in allowed months come from carryover
      remainingCarryover = isCarryoverExpired ? 0 : (carryoverAvailable - daysUsedInAllowedMonths);
      // Days outside allowed months consume new year balance
      remainingNewYearBalance = newYearBalance - daysUsedOutsideAllowedMonths;
    } else {
      // Carryover exhausted for allowed months, remaining days come from new year balance
      remainingCarryover = 0;
      const excessFromAllowedMonths = daysUsedInAllowedMonths - effectiveCarryoverForDeduction;
      remainingNewYearBalance = newYearBalance - (daysUsedOutsideAllowedMonths + excessFromAllowedMonths);
    }
  }
  
  // Total remaining balance
  let remainingBalance = remainingNewYearBalance + remainingCarryover;
  
  // Final check: if carryover has expired (as set by leader), remove any unused carryover
  if (isCarryoverExpired) {
    // If carryover expired and we still have remaining carryover, it's lost
    remainingCarryover = 0;
    // If remaining balance exceeds new year balance, it means unused carryover expired
    if (remainingBalance > newYearBalance) {
      remainingBalance = newYearBalance;
    }
  }
  
  return remainingBalance;
};

/**
 * Calculate carryover balance separately
 * Returns the remaining carryover after usage (consume carryover first, then new year)
 * IMPORTANT: If carryoverSettings.limitedToMonths is set, only days used in allowed months consume carryover
 */
export function calculateCarryoverBalance(
  userOrSchedule: User | ShiftSchedule,
  daysUsed: number,
  approvedRequests?: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  carryoverSettings?: { limitedToMonths?: number[] }
): number {
  // Only check if userOrSchedule is a User object (has carryoverFromPreviousYear field)
  if (!('carryoverFromPreviousYear' in userOrSchedule) || !userOrSchedule.carryoverFromPreviousYear) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const isExpired = userOrSchedule.carryoverExpiryDate && 
    new Date(userOrSchedule.carryoverExpiryDate).setHours(0, 0, 0, 0) < today.getTime();
  
  if (isExpired) {
    return 0;
  }

  const originalCarryover = userOrSchedule.carryoverFromPreviousYear;
  
  // If month limitations are set, split days into allowed months vs outside allowed months
  if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0 && approvedRequests) {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(currentYear, 11, 31);
    yearEnd.setHours(23, 59, 59, 999);
    
    // Filter out maternity leave requests
    const nonMaternityRequests = approvedRequests.filter(req => 
      !req.reason || !isMaternityLeave(req.reason)
    );
    
    const allowedMonths = carryoverSettings.limitedToMonths;
    let daysUsedInAllowedMonths = 0;
    
    // Helper function to calculate working days for a date range within allowed months
    const calculateWorkingDaysInAllowedMonths = (
      startDate: Date,
      endDate: Date,
      allowedMonths: number[],
      schedule: User | ShiftSchedule
    ): number => {
      let totalDays = 0;
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const currentMonthStart = new Date(start);
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0, 0, 0, 0);
      
      const lastMonthStart = new Date(end);
      lastMonthStart.setDate(1);
      lastMonthStart.setHours(0, 0, 0, 0);
      
      const currentMonth = new Date(currentMonthStart);
      
      while (currentMonth <= lastMonthStart) {
        const monthIndex = currentMonth.getMonth();
        
        if (allowedMonths.includes(monthIndex)) {
          const monthStart = new Date(Math.max(start.getTime(), currentMonth.getTime()));
          monthStart.setHours(0, 0, 0, 0);
          
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
          monthEnd.setHours(23, 59, 59, 999);
          const monthEndActual = new Date(Math.min(end.getTime(), monthEnd.getTime()));
          
          if (monthStart <= monthEndActual) {
            const workingDays = ('shiftSchedule' in schedule)
              ? countWorkingDays(monthStart, monthEndActual, schedule as User)
              : countWorkingDays(monthStart, monthEndActual, schedule as ShiftSchedule);
            totalDays += workingDays;
          }
        }
        
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
      
      return totalDays;
    };
    
    // Calculate days used in allowed months only
    nonMaternityRequests.forEach(req => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      
      if (reqStart <= yearEnd && reqEnd >= yearStart) {
        const overlapStart = reqStart > yearStart ? reqStart : yearStart;
        const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
        
        const daysInAllowed = calculateWorkingDaysInAllowedMonths(
          overlapStart,
          overlapEnd,
          allowedMonths,
          userOrSchedule
        );
        daysUsedInAllowedMonths += daysInAllowed;
      }
    });
    
    // Only consume carryover for days used in allowed months
    if (daysUsedInAllowedMonths <= originalCarryover) {
      return originalCarryover - daysUsedInAllowedMonths;
    } else {
      return 0;
    }
  }
  
  // No month limit: use original logic (consume carryover first, then new year)
  if (daysUsed <= originalCarryover) {
    // All days used come from carryover
    return originalCarryover - daysUsed;
  } else {
    // Carryover exhausted
    return 0;
  }
}

/**
 * Returns the number of days actually used from carryover this year.
 * Respects limitedToMonths: only days in allowed months count as "used from carryover".
 * Use this for display so that when carryover is expired we still show the correct used count (e.g. 4 not 6).
 */
export function getCarryoverDaysUsed(
  userOrSchedule: User | ShiftSchedule,
  daysUsed: number,
  approvedRequests?: Array<{ startDate: Date; endDate: Date; reason?: string }>,
  carryoverSettings?: { limitedToMonths?: number[] }
): number {
  if (!('carryoverFromPreviousYear' in userOrSchedule) || !userOrSchedule.carryoverFromPreviousYear) {
    return 0;
  }
  const originalCarryover = userOrSchedule.carryoverFromPreviousYear;

  if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0 && approvedRequests) {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(currentYear, 11, 31);
    yearEnd.setHours(23, 59, 59, 999);
    const nonMaternityRequests = approvedRequests.filter(req =>
      !req.reason || !isMaternityLeave(req.reason)
    );
    const allowedMonths = carryoverSettings.limitedToMonths;
    let daysUsedInAllowedMonths = 0;
    const calculateWorkingDaysInAllowedMonths = (
      startDate: Date,
      endDate: Date,
      allowedMonthsArr: number[],
      schedule: User | ShiftSchedule
    ): number => {
      let totalDays = 0;
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const currentMonthStart = new Date(start);
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const lastMonthStart = new Date(end);
      lastMonthStart.setDate(1);
      lastMonthStart.setHours(0, 0, 0, 0);
      const currentMonth = new Date(currentMonthStart);
      while (currentMonth <= lastMonthStart) {
        const monthIndex = currentMonth.getMonth();
        if (allowedMonthsArr.includes(monthIndex)) {
          const monthStart = new Date(Math.max(start.getTime(), currentMonth.getTime()));
          monthStart.setHours(0, 0, 0, 0);
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
          monthEnd.setHours(23, 59, 59, 999);
          const monthEndActual = new Date(Math.min(end.getTime(), monthEnd.getTime()));
          if (monthStart <= monthEndActual) {
            const workingDays = ('shiftSchedule' in schedule)
              ? countWorkingDays(monthStart, monthEndActual, schedule as User)
              : countWorkingDays(monthStart, monthEndActual, schedule as ShiftSchedule);
            totalDays += workingDays;
          }
        }
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
      return totalDays;
    };
    nonMaternityRequests.forEach(req => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      if (reqStart <= yearEnd && reqEnd >= yearStart) {
        const overlapStart = reqStart > yearStart ? reqStart : yearStart;
        const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
        daysUsedInAllowedMonths += calculateWorkingDaysInAllowedMonths(
          overlapStart,
          overlapEnd,
          allowedMonths,
          userOrSchedule
        );
      }
    });
    return Math.min(originalCarryover, daysUsedInAllowedMonths);
  }

  return Math.min(originalCarryover, daysUsed);
}

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
