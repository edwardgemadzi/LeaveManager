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
  manualLeaveBalance?: number
): number => {
  const currentYear = new Date().getFullYear();
  
  const approvedWorkingDays = approvedRequests
    .filter(req => new Date(req.startDate).getFullYear() === currentYear)
    .reduce((total, req) => {
      const workingDays = countWorkingDays(
        new Date(req.startDate),
        new Date(req.endDate),
        shiftSchedule
      );
      return total + workingDays;
    }, 0);

  // If manual balance is set, use it as the base and subtract approved requests
  // Otherwise, use the standard calculation
  const baseBalance = manualLeaveBalance !== undefined ? manualLeaveBalance : maxLeavePerYear;
  return baseBalance - approvedWorkingDays;
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
