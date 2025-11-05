import { ShiftSchedule, User, Team, LeaveRequest } from '@/types';
import { countWorkingDays, calculateLeaveBalance, isWorkingDay, getWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from './leaveCalculations';

// Check if bypass notice period is active for a given team and date
export const isBypassNoticePeriodActive = (team: Team, date: Date = new Date()): boolean => {
  if (!team.settings.bypassNoticePeriod?.enabled) {
    return false;
  }
  
  const bypass = team.settings.bypassNoticePeriod;
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  if (bypass.startDate && bypass.endDate) {
    const startDate = new Date(bypass.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(bypass.endDate);
    endDate.setHours(23, 59, 59, 999);
    
    return checkDate >= startDate && checkDate <= endDate;
  }
  
  return false;
};

// Generate a unique tag for working days pattern
// Members with the same tag work on exactly the same days (100% overlap)
// For rotating schedules: Generates tag from next 10 actual working days (not stored)
// For fixed schedules: Generates tag from Mon-Sun pattern (can be stored)
export const generateWorkingDaysTag = (shiftSchedule?: ShiftSchedule): string => {
  // If no schedule, return special tag
  if (!shiftSchedule) {
    return 'no-schedule';
  }

  // Validate pattern exists and is array
  if (!shiftSchedule.pattern || !Array.isArray(shiftSchedule.pattern)) {
    return 'no-schedule';
  }

  // For fixed schedules: Convert pattern to readable tag
  // Pattern: [true,true,true,true,true,false,false] → "MTWTF__"
  // This is stable and can be stored
  if (shiftSchedule.type === 'fixed') {
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    // Ensure pattern has exactly 7 elements (Mon-Sun)
    // If pattern is shorter or longer, pad or truncate
    const normalizedPattern = shiftSchedule.pattern.slice(0, 7);
    while (normalizedPattern.length < 7) {
      normalizedPattern.push(false);
    }
    
    return normalizedPattern
      .map((isWorking, index) => isWorking ? dayNames[index] : '_')
      .join('');
  }

  // For rotating schedules: Generate tag from next 10 actual working days
  // This accounts for different start dates - members with same pattern but
  // different start dates will work on different actual days and get different tags
  // Tags change daily as "today" moves forward, so they should NOT be stored
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const next10Days: boolean[] = [];
  for (let i = 0; i < 10; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const isWorking = isWorkingDay(checkDate, shiftSchedule);
    next10Days.push(isWorking);
  }
  
  // Convert to binary string: true = '1', false = '0'
  return next10Days.map(working => working ? '1' : '0').join('');
};

// Get start and end dates of current calendar year
const getYearStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
};

const getYearEnd = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31);
};

// Calculate theoretical working days remaining from today to end of year
// This is the raw count - NOT adjusted for concurrent leave sharing among members
export const calculateRemainingWorkingDaysInYear = (shiftSchedule: ShiftSchedule): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearEnd = getYearEnd();
  yearEnd.setHours(23, 59, 59, 999);
  
  return countWorkingDays(today, yearEnd, shiftSchedule);
};

// Calculate working days from start of year to today
export const calculateYearToDateWorkingDays = (shiftSchedule: ShiftSchedule): number => {
  const yearStart = getYearStart();
  yearStart.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  return countWorkingDays(yearStart, today, shiftSchedule);
};

// Calculate availability for a specific date (how many slots are available)
// Only counts requests from members with the same workingDaysTag, shiftTag, and subgroupTag
// 
// IMPORTANT: This is the ONLY function that directly uses team.settings.concurrentLeave
// All other calculations (usableDays, realisticUsableDays, remainderDays) depend on this function
// through the calculation chain: calculateDateAvailability → calculateUsableDays → getMemberAnalytics
// Therefore, the team object must be the same instance throughout the chain to ensure consistency
export const calculateDateAvailability = (
  team: Team,
  allApprovedRequests: LeaveRequest[],
  members: User[],
  date: Date,
  userId: string,
  userShiftSchedule: ShiftSchedule,
  userWorkingDaysTag?: string,
  userShiftTag?: string,
  userSubgroupTag?: string
): number => {
  // Explicit validation: Ensure team.settings exists and concurrentLeave is a valid number
  if (!team || !team.settings) {
    console.error('[Analytics] calculateDateAvailability - ERROR: team.settings is missing!', {
      hasTeam: !!team,
      hasSettings: !!team?.settings
    });
    return 0; // Return 0 if team settings are missing
  }
  
  if (typeof team.settings.concurrentLeave !== 'number' || team.settings.concurrentLeave < 1) {
    console.error('[Analytics] calculateDateAvailability - ERROR: team.settings.concurrentLeave is invalid!', {
      value: team.settings.concurrentLeave,
      type: typeof team.settings.concurrentLeave
    });
    return 0; // Return 0 if concurrentLeave is invalid
  }
  
  const concurrentLeave = team.settings.concurrentLeave;
  
  // Debug: Log concurrent leave setting (only log occasionally to avoid spam)
  if (typeof window === 'undefined') {
    // Server-side only - log occasionally to verify it's being used
    const logKey = `calcAvail_${team._id || 'unknown'}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastLog = (global as any)[logKey] || 0;
    const now = Date.now();
    if (now - lastLog > 2000) { // Log at most once per 2 seconds per team
      console.log('[Analytics] calculateDateAvailability - team.settings.concurrentLeave:', team.settings.concurrentLeave, 'Using:', concurrentLeave);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any)[logKey] = now;
    }
  }
  
  // Create a normalized copy of the date for comparison (don't mutate original)
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  // Only consider this date if it's a working day for the user
  if (!isWorkingDay(checkDate, userShiftSchedule)) {
    // If it's not a working day for the user, return 0 (not usable)
    return 0;
  }
  
  // Find all approved requests that overlap with this date
  // Exclude maternity leave requests from concurrent leave calculations (maternity leave is isolated)
  const overlappingRequests = allApprovedRequests.filter(req => {
    // Skip maternity leave requests
    if (req.reason && (req.reason.toLowerCase() === 'maternity' || req.reason.toLowerCase().includes('maternity') || req.reason.toLowerCase().includes('paternity'))) {
      return false;
    }
    
    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    
    // Check if date falls within request range
    return checkDate >= reqStart && checkDate <= reqEnd;
  });
  
  // Count only requests from users who:
  // 1. Work on this date (same working days)
  // 2. Have the same workingDaysTag (work on exactly the same days)
  // 3. Have the same shiftTag (day/night/mixed)
  let relevantCount = 0;
  
  for (const req of overlappingRequests) {
    // Skip user's own requests (they don't block themselves)
    if (req.userId === userId) continue;
    
    const reqUser = members.find(m => m._id === req.userId);
    if (!reqUser) continue;
    
    // Get the requesting user's schedule (or default)
    const reqUserSchedule = reqUser.shiftSchedule || {
      pattern: [true, true, true, true, true, false, false],
      startDate: new Date(),
      type: 'fixed'
    };
    
    // Only count if the requesting user also works on this date
    if (!isWorkingDay(checkDate, reqUserSchedule)) continue;
    
    // Check if they have the same workingDaysTag
    // For rotating schedules, always regenerate (tags change daily)
    // For fixed schedules, use stored tag or generate if missing
    const reqUserWorkingDaysTag = reqUser.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(reqUser.shiftSchedule)
      : (reqUser.workingDaysTag || generateWorkingDaysTag(reqUser.shiftSchedule));
    if (userWorkingDaysTag !== undefined) {
      if (reqUserWorkingDaysTag !== userWorkingDaysTag) continue;
    }
    
    // Check if they have the same shiftTag
    if (userShiftTag !== undefined) {
      if (reqUser.shiftTag !== userShiftTag) continue;
    } else {
      // User has no shift tag - only count members with no shift tag
      if (reqUser.shiftTag !== undefined) continue;
    }
    
    // Check subgroup if subgrouping is enabled
    if (team.settings.enableSubgrouping) {
      // Get requesting user's subgroup (or "Ungrouped")
      const userSubgroup = userSubgroupTag || 'Ungrouped';
      // Get request user's subgroup (or "Ungrouped")
      const reqUserSubgroup = reqUser.subgroupTag || 'Ungrouped';
      
      // Only count if they're in the same subgroup
      if (userSubgroup !== reqUserSubgroup) continue;
    }
    
    // This member qualifies - they work on this day, have same tag, same shift tag, and same subgroup
    relevantCount++;
  }
  
  // Available slots = concurrent limit - current count
  return Math.max(0, concurrentLeave - relevantCount);
};

// Calculate usable days - shows how many days can be used when shared among members who can use them
// This accounts for concurrent leave constraints and shows actual availability
// Only considers members with the same workingDaysTag and shiftTag
// 
// IMPORTANT: This function calls calculateDateAvailability which uses team.settings.concurrentLeave
// The team object must be the same instance used throughout the calculation chain to ensure
// concurrent leave settings are consistently applied
export const calculateUsableDays = (
  user: User,
  team: Team,
  allApprovedRequests: LeaveRequest[],
  allMembers: User[],
  shiftSchedule: ShiftSchedule
): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearEnd = getYearEnd();
  yearEnd.setHours(23, 59, 59, 999);
  
  // Check if bypass notice period is active
  const bypassActive = isBypassNoticePeriodActive(team, today);
  
  // Calculate earliest requestable date based on notice period (unless bypass is active)
  let earliestRequestableDate = today;
  if (!bypassActive) {
    earliestRequestableDate = new Date(today);
    earliestRequestableDate.setDate(today.getDate() + team.settings.minimumNoticePeriod);
    earliestRequestableDate.setHours(0, 0, 0, 0);
  }
  
  // Get user's tags for filtering
  // For rotating schedules, always regenerate (tags change daily)
  // For fixed schedules, use stored tag or generate if missing
  const userWorkingDaysTag = user.shiftSchedule?.type === 'rotating'
    ? generateWorkingDaysTag(user.shiftSchedule)
    : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule));
  const userShiftTag = user.shiftTag;
  const userSubgroupTag = user.subgroupTag;
  
  // Get all remaining working days in the year (starting from earliest requestable date)
  const remainingWorkingDays = getWorkingDays(earliestRequestableDate, yearEnd, shiftSchedule);
  
  // Count days that have availability (slots > 0) among members with same tag
  let usableDays = 0;
  let blockedDays = 0;
  
  // Debug: Count days with different availability levels
  const availabilityCounts: Record<number, number> = {};
  
  for (const workingDay of remainingWorkingDays) {
    const availability = calculateDateAvailability(
      team,
      allApprovedRequests,
      allMembers,
      workingDay,
      user._id || '',
      shiftSchedule,
      userWorkingDaysTag,
      userShiftTag,
      userSubgroupTag
    );
    
    // Track availability distribution
    availabilityCounts[availability] = (availabilityCounts[availability] || 0) + 1;
    
    // If there's at least one available slot, this day is usable
    if (availability > 0) {
      usableDays++;
    } else {
      blockedDays++;
    }
  }
  
  // Debug: Log availability distribution and sample dates for first user calculation (to avoid spam)
  if (typeof window === 'undefined') {
    const logKey = `usableDays_${team._id || 'unknown'}_${user.username || 'unknown'}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastLog = (global as any)[logKey] || 0;
    const now = Date.now();
    if (now - lastLog > 5000) { // Log at most once per 5 seconds per user
      // Sample a few dates to see what's happening
      const sampleDates = remainingWorkingDays.slice(0, 5).map(d => d.toISOString().split('T')[0]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yearEnd = getYearEnd();
      yearEnd.setHours(23, 59, 59, 999);
      
      // Count approved requests that could affect these dates
      const futureRequests = allApprovedRequests.filter(req => {
        const reqStart = new Date(req.startDate);
        reqStart.setHours(0, 0, 0, 0);
        return reqStart >= today && reqStart <= yearEnd;
      });
      
      console.log(`[calculateUsableDays] ${user.username} - Concurrent leave: ${team.settings.concurrentLeave}, Usable: ${usableDays}, Blocked: ${blockedDays}`);
      console.log(`[calculateUsableDays] ${user.username} - Availability distribution:`, availabilityCounts);
      console.log(`[calculateUsableDays] ${user.username} - Sample dates:`, sampleDates);
      console.log(`[calculateUsableDays] ${user.username} - Future approved requests: ${futureRequests.length}, Total approved requests: ${allApprovedRequests.length}`);
      console.log(`[calculateUsableDays] ${user.username} - Members in same group: ${allMembers.length}, User subgroup: ${userSubgroupTag || 'none'}, User shift: ${userShiftTag || 'none'}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any)[logKey] = now;
    }
  }
  
  return usableDays;
};

// Check if two shift schedules have overlapping working days
export const schedulesHaveOverlappingWorkingDays = (
  schedule1: ShiftSchedule,
  schedule2: ShiftSchedule,
  startDate: Date,
  endDate: Date
): boolean => {
  // Get working days for each schedule in the date range
  const workingDays1 = getWorkingDays(startDate, endDate, schedule1);
  const workingDays2 = getWorkingDays(startDate, endDate, schedule2);
  
  // Check if there's any overlap
  const workingDays1Set = new Set(
    workingDays1.map(d => d.toISOString().split('T')[0])
  );
  
  return workingDays2.some(d => 
    workingDays1Set.has(d.toISOString().split('T')[0])
  );
};

// Calculate how many members share the same working days (for competition context)
// Uses workingDaysTag to identify members who work on exactly the same days (100% overlap)
// Also considers shiftTag (day/night/mixed) to separate shift types
export const calculateMembersSharingSameShift = (
  user: User,
  allMembers: User[]
): number => {
  // Get user's working days tag
  // For rotating schedules, always regenerate (tags change daily)
  // For fixed schedules, use stored tag or generate if missing
  const userWorkingDaysTag = user.shiftSchedule?.type === 'rotating'
    ? generateWorkingDaysTag(user.shiftSchedule)
    : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule));
  const userShiftTag = user.shiftTag;
  const userSubgroupTag = user.subgroupTag;
  
  // Ensure allMembers only contains members (filter out leaders if any)
  const memberList = allMembers.filter(m => m.role === 'member');
  
  // Count members who have the exact same working days tag, shift tag, and subgroup tag
  // IMPORTANT: All conditions must be true - working days AND shift tag AND subgroup
  const membersWithSameTag = memberList.filter(member => {
    // Skip self - use both _id comparison and ensure we're not comparing to self
    if (!member._id || !user._id) return false;
    if (String(member._id).trim() === String(user._id).trim()) return false;
    
    // Get member's working days tag
    // For rotating schedules, always regenerate (tags change daily)
    // For fixed schedules, use stored tag or generate if missing
    const memberWorkingDaysTag = member.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(member.shiftSchedule)
      : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule));
    const memberShiftTag = member.shiftTag;
    const memberSubgroupTag = member.subgroupTag;
    
    // FIRST: Must have exact same working days pattern (this is the primary filter)
    if (memberWorkingDaysTag !== userWorkingDaysTag) {
      return false;
    }
    
    // SECOND: If user has a shift tag, member must have the same shift tag
    // If user has no shift tag, only count members who also have no shift tag
    if (userShiftTag !== undefined) {
      if (memberShiftTag !== userShiftTag) {
        return false;
      }
    } else {
      // User has no shift tag - only count members with no shift tag
      if (memberShiftTag !== undefined) {
        return false;
      }
    }
    
    // THIRD: Check subgroup (if subgrouping is enabled, filter by subgroup)
    // Get user's subgroup (or "Ungrouped")
    const userSubgroup = userSubgroupTag || 'Ungrouped';
    // Get member's subgroup (or "Ungrouped")
    const memberSubgroup = memberSubgroupTag || 'Ungrouped';
    
    // Only count if they're in the same subgroup
    if (userSubgroup !== memberSubgroup) {
      return false;
    }
    
    return true;
  });
  
  // Return count + 1 (including self)
  return membersWithSameTag.length + 1;
};

// Calculate average days available per member (fair distribution estimate)
// Returns whole days (floor division) - remainder is calculated separately
export const calculateAverageDaysPerMember = (
  usableDays: number,
  membersSharingSameShift: number
): number => {
  if (membersSharingSameShift === 0) {
    return 0;
  }
  
  return Math.floor(usableDays / membersSharingSameShift);
};

// Calculate carryover vs lost days
// Calculate remainder days for a group using iterative allocation
// Allocates days one by one to members, removing them when they reach their max,
// and returns days that can't be allocated evenly when remaining days < remaining members
// Note: groupUsableDays already accounts for concurrent leave constraints (only counts days with availability > 0)
// The allocation respects these constraints since we're allocating from the constrained pool
export const calculateGroupRemainderDays = (
  groupUsableDays: number,
  groupMembers: Array<{ analytics: MemberAnalytics }>
): number => {
  // Create working copy of members with their remaining balance
  let availableMembers = groupMembers
    .map(m => ({ 
      member: m, 
      remainingBalance: m.analytics.remainingLeaveBalance,
      allocated: 0
    }))
    .filter(m => m.remainingBalance > 0); // Only include members with balance > 0
  
  if (availableMembers.length === 0) {
    return groupUsableDays; // All members have 0 balance, all days are remainder
  }
  
  let pool = groupUsableDays; // Days available for allocation
  
  // Phase 1: Base allocation - give each member floor(pool / totalMembers)
  const baseAllocation = Math.floor(pool / groupMembers.length);
  
  for (const memberData of availableMembers) {
    const canAllocate = Math.min(baseAllocation, memberData.remainingBalance);
    memberData.allocated += canAllocate;
    memberData.remainingBalance -= canAllocate;
    pool -= canAllocate;
    
    // Remove member if they've reached their max
    if (memberData.remainingBalance === 0) {
      availableMembers = availableMembers.filter(m => m !== memberData);
    }
  }
  
  // Phase 2: Continue allocating remaining days in rounds
  // In each round, allocate evenly to all available members
  // Stop when pool < number of available members (can't allocate evenly)
  while (pool > 0 && availableMembers.length > 0) {
    // If remaining pool < number of available members, we have remainder
    if (pool < availableMembers.length) {
      break; // These are the remainder days
    }
    
    // Calculate how many days we can allocate in this round
    // Allocate evenly: floor(pool / availableMembers.length) to each member
    const allocationPerMember = Math.floor(pool / availableMembers.length);
    
    if (allocationPerMember === 0) {
      break; // Can't allocate at least 1 to each, we have remainder
    }
    
    // Allocate to each member, respecting their remaining balance
    const membersToRemove: typeof availableMembers = [];
    
    for (const memberData of availableMembers) {
      const canAllocate = Math.min(allocationPerMember, memberData.remainingBalance);
      memberData.allocated += canAllocate;
      memberData.remainingBalance -= canAllocate;
      pool -= canAllocate;
      
      // Mark for removal if they've reached their max
      if (memberData.remainingBalance === 0) {
        membersToRemove.push(memberData);
      }
    }
    
    // Remove members who reached their max
    availableMembers = availableMembers.filter(m => !membersToRemove.includes(m));
  }
  
  // Pool now contains the remainder days that can't be allocated evenly
  return pool;
};

export const calculateCarryoverDays = (
  remainingLeaveBalance: number,
  remainingWorkingDays: number,
  allowCarryover: boolean
): { willCarryover: number; willLose: number } => {
  // Calculate days that cannot be used this year
  // If remaining leave > remaining working days, the excess will either carry over or be lost
  // If remaining leave <= remaining working days, nothing carries over (they can use all their leave)
  const unusedDays = Math.max(0, remainingLeaveBalance - remainingWorkingDays);
  
  if (allowCarryover) {
    return {
      willCarryover: unusedDays,
      willLose: 0
    };
  } else {
    return {
      willCarryover: 0,
      willLose: unusedDays
    };
  }
};

// Analytics data structure for a member
export interface MemberAnalytics {
  remainingWorkingDays: number; // Theoretical working days remaining (kept for backward compatibility)
  theoreticalWorkingDays: number; // Total working days remaining from today to end of year - NOT adjusted for concurrent leave sharing (raw count)
  usableDays: number; // Days that can be used when shared among members who can use them - adjusted for concurrent leave limits
  realisticUsableDays: number; // Realistic days factoring in members sharing same schedule who also need to use remaining leave days (whole days per member)
  remainingLeaveBalance: number; // Remaining balance after subtracting approved requests
  baseLeaveBalance: number; // Base balance (manualLeaveBalance if set, otherwise maxLeavePerYear) - before subtracting approved requests
  workingDaysUsed: number;
  workingDaysInYear: number;
  willCarryover: number;
  willLose: number;
  allowCarryover: boolean;
  membersSharingSameShift: number; // Total members competing for same days
  averageDaysPerMember: number; // Average realistic days per member in same shift (whole days)
  surplusBalance: number; // Surplus balance when manual balance exceeds team max
  remainderDays: number; // Extra days that need allocation decisions (remainder from usableDays / membersSharingSameShift)
}

// Analytics data structure for maternity leave (simpler, no competition metrics)
export interface MaternityMemberAnalytics {
  remainingMaternityLeaveBalance: number; // Remaining maternity leave balance after subtracting approved maternity requests
  baseMaternityLeaveBalance: number; // Base maternity leave balance (manualMaternityLeaveBalance if set, otherwise maxMaternityLeaveDays)
  maternityDaysUsed: number; // Maternity leave days used year-to-date
  surplusMaternityBalance: number; // Surplus maternity balance when manual balance exceeds team max
}

// Analytics data structure for team
export interface TeamAnalytics {
  aggregate: {
    totalRemainingWorkingDays: number; // Kept for backward compatibility
    totalTheoreticalWorkingDays: number; // Total theoretical working days remaining - NOT adjusted for concurrent leave sharing (raw count)
    totalUsableDays: number; // Total usable days when shared among members - adjusted for concurrent leave limits
    totalRealisticUsableDays: number; // Total realistic usable days factoring in members sharing same schedule
    totalRemainderDays: number; // Total remainder days that need allocation decisions
    totalRemainingLeaveBalance: number;
    totalWillCarryover: number;
    totalWillLose: number;
    averageRemainingBalance: number;
    membersCount: number;
    averageDaysPerMemberAcrossTeam: number; // Average realistic days per member across entire team
  };
  members: Array<{
    userId: string;
    username: string;
    fullName?: string;
    analytics: MemberAnalytics;
  }>;
}

// Grouped analytics for leaders - members organized by workingDaysTag + shiftTag
export interface GroupedTeamAnalytics {
  aggregate: {
    totalRemainingWorkingDays: number;
    totalTheoreticalWorkingDays: number;
    totalUsableDays: number;
    totalRealisticUsableDays: number;
    totalRemainderDays: number;
    totalRemainingLeaveBalance: number;
    totalWillCarryover: number;
    totalWillLose: number;
    averageRemainingBalance: number;
    membersCount: number;
    averageDaysPerMemberAcrossTeam: number;
  };
  groups: Array<{
    groupKey: string; // Format: "subgroup_shiftTag_workingDaysTag" or "shiftTag_workingDaysTag"
    subgroupTag?: string; // Subgroup name (if subgrouping is enabled)
    shiftTag?: string;
    workingDaysTag: string;
    aggregate: {
      groupTotalMembers: number;
      groupAverageRealisticUsableDays: number;
      groupTotalUsableDays: number;
      groupTotalRealisticUsableDays: number;
      groupTotalRemainderDays: number;
      groupAverageLeaveBalance: number;
      groupTotalLeaveBalance: number;
      groupAverageUsableDays: number;
    };
    members: Array<{
      userId: string;
      username: string;
      fullName?: string;
      analytics: MemberAnalytics;
    }>;
  }>;
}

// Get complete analytics for a single member
// 
// IMPORTANT: This function calls calculateUsableDays which uses team.settings.concurrentLeave
// The team object must be the same instance fetched from the API to ensure concurrent leave
// settings are consistently applied across all member calculations
export const getMemberAnalytics = (
  user: User,
  team: Team,
  approvedRequests: LeaveRequest[],
  allApprovedRequests: LeaveRequest[],
  allMembers: User[]
): MemberAnalytics => {
  const shiftSchedule = user.shiftSchedule || {
    pattern: [true, true, true, true, true, false, false],
    startDate: new Date(),
    type: 'fixed'
  };

  // If subgrouping is enabled, filter members to only include those in the same subgroup
  // Members without subgroupTag compete only with other ungrouped members
  let filteredMembers = allMembers;
  if (team.settings.enableSubgrouping) {
    const userSubgroup = user.subgroupTag || 'Ungrouped';
    filteredMembers = allMembers.filter(member => {
      // Include the user themselves
      if (member._id === user._id) return true;
      // Include only members in the same subgroup
      const memberSubgroup = member.subgroupTag || 'Ungrouped';
      return memberSubgroup === userSubgroup;
    });
  }
  
  // Filter out members with 0 base balance from realistic calculations
  // Members with 0 base balance should not affect competition/realistic calculations
  const membersWithNonZeroBase = filteredMembers.filter(member => {
    const memberBaseBalance = member.manualLeaveBalance !== undefined 
      ? member.manualLeaveBalance 
      : team.settings.maxLeavePerYear;
    return memberBaseBalance > 0;
  });

  // Calculate theoretical remaining working days in year
  // This is the raw count of working days remaining - NOT adjusted for concurrent leave sharing
  const theoreticalWorkingDays = calculateRemainingWorkingDaysInYear(shiftSchedule);
  
  // Calculate usable days - adjusted for concurrent leave constraints
  // This shows how many days can be used when shared among members who can use them
  // Only include members with non-zero base balance in calculations
  
  // Validate team.settings before calculation
  if (!team || !team.settings || typeof team.settings.concurrentLeave !== 'number') {
    console.error('[Analytics] getMemberAnalytics - ERROR: Invalid team.settings for user:', user.username, {
      hasTeam: !!team,
      hasSettings: !!team?.settings,
      concurrentLeave: team?.settings?.concurrentLeave,
      concurrentLeaveType: typeof team?.settings?.concurrentLeave
    });
    // This will cause calculateUsableDays to fail, but it's better to fail explicitly
  }
  
  if (typeof window === 'undefined') {
    const logKey = `getMember_${team._id || 'unknown'}_${user.username || 'unknown'}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastLog = (global as any)[logKey] || 0;
    const now = Date.now();
    if (now - lastLog > 2000) { // Log at most once per 2 seconds per team/user
      console.log('[Analytics] getMemberAnalytics - team.settings.concurrentLeave:', team.settings?.concurrentLeave, 'for user:', user.username);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any)[logKey] = now;
    }
  }
  const usableDays = calculateUsableDays(
    user,
    team,
    allApprovedRequests,
    membersWithNonZeroBase, // Use members with non-zero base balance
    shiftSchedule
  );
  
  // Calculate total working days in year
  const yearStart = getYearStart();
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = getYearEnd();
  yearEnd.setHours(23, 59, 59, 999);
  const workingDaysInYear = countWorkingDays(yearStart, yearEnd, shiftSchedule);
  
  // Calculate working days used year-to-date
  const workingDaysUsed = calculateYearToDateWorkingDays(shiftSchedule);
  
  // Calculate remaining leave balance
  // Note: approvedRequests parameter should already be filtered to approved requests
  // But we filter again here for safety and consistency with leave balance page
  // Include reason field so calculateLeaveBalance can filter out maternity leave
  const approvedRequestsForCalculation = approvedRequests
    .filter(req => req.status === 'approved')
    .map(req => ({
      startDate: new Date(req.startDate),
      endDate: new Date(req.endDate),
      reason: req.reason
    }));
  
  // Calculate base balance (same simplified logic as calculateLeaveBalance):
  // - If manualLeaveBalance is set, always use it as base (whether above or below maxLeavePerYear)
  // - If manualLeaveBalance is not set, use maxLeavePerYear
  const baseLeaveBalance = user.manualLeaveBalance !== undefined ? user.manualLeaveBalance : team.settings.maxLeavePerYear;
  
  // Debug: Log if approvedRequests is empty but manualLeaveBalance is set
  if (user.manualLeaveBalance !== undefined && approvedRequestsForCalculation.length === 0) {
    console.log(`[DEBUG] User ${user.username}: manualLeaveBalance=${user.manualLeaveBalance}, but no approved requests found`);
  }
  
  const remainingLeaveBalance = calculateLeaveBalance(
    team.settings.maxLeavePerYear,
    approvedRequestsForCalculation,
    shiftSchedule,
    user.manualLeaveBalance,
    user.manualYearToDateUsed
  );
  
  // Debug: Log if remaining equals base (indicates no approved requests were counted)
  if (user.manualLeaveBalance !== undefined && Math.round(remainingLeaveBalance) === Math.round(baseLeaveBalance) && approvedRequestsForCalculation.length > 0) {
    console.log(`[DEBUG getMemberAnalytics] User ${user.username}: remainingBalance=${remainingLeaveBalance}, baseBalance=${baseLeaveBalance}, approvedRequests=${approvedRequestsForCalculation.length}`);
    approvedRequestsForCalculation.forEach((req, idx) => {
      console.log(`  [DEBUG] Request ${idx + 1}: ${req.startDate.toISOString()} to ${req.endDate.toISOString()}`);
    });
  }
  
  // Always log for specific users to debug
  if (user.username === 'francisbentum' || user.username === 'edgemadzi') {
    console.log(`[DEBUG getMemberAnalytics] ${user.username}: baseBalance=${baseLeaveBalance}, remainingBalance=${remainingLeaveBalance}, approvedRequests=${approvedRequestsForCalculation.length}`);
  }
  
  // Calculate surplus balance
  const surplusBalance = calculateSurplusBalance(user.manualLeaveBalance, team.settings.maxLeavePerYear);
  
  // Calculate competition metrics (using filtered members if subgrouping is enabled)
  // Only include members with non-zero base balance in competition calculations
  const membersSharingSameShift = calculateMembersSharingSameShift(user, membersWithNonZeroBase);
  
  // Calculate realistic usable days - factors in members sharing same schedule
  // This divides usable days by members sharing the same shift, capped by remaining leave balance
  // Use floor division to get whole days, remainder is calculated separately
  const realisticUsableDays = membersSharingSameShift > 0
    ? Math.min(
        Math.floor(usableDays / membersSharingSameShift),
        remainingLeaveBalance
      )
    : Math.min(usableDays, remainingLeaveBalance);
  
  // Calculate remainder days - extra days that need allocation decisions
  // Remainder is the leftover days after dividing usableDays by membersSharingSameShift
  // Example: 25 usable days, 10 members = 25 / 10 = 2 remainder 5
  // Each gets 2 days, 5 days need allocation (can't be split equally among 10 people)
  // Example: 20 usable days, 10 members = 20 / 10 = 2 remainder 0
  // Each gets 2 days, 0 remainder (can be allocated equally)
  const remainderDays = membersSharingSameShift > 0
    ? usableDays % membersSharingSameShift
    : 0;
  
  const averageDaysPerMember = calculateAverageDaysPerMember(usableDays, membersSharingSameShift);
  
  // Calculate carryover/loss using realistic usable days (not theoretical)
  const allowCarryover = team.settings.allowCarryover || false;
  const { willCarryover, willLose } = calculateCarryoverDays(
    remainingLeaveBalance,
    realisticUsableDays,
    allowCarryover
  );
  
  return {
    remainingWorkingDays: theoreticalWorkingDays, // Keep for backward compatibility
    theoreticalWorkingDays,
    usableDays,
    realisticUsableDays,
    remainingLeaveBalance,
    baseLeaveBalance,
    workingDaysUsed,
    workingDaysInYear,
    willCarryover,
    willLose,
    allowCarryover,
    membersSharingSameShift,
    averageDaysPerMember,
    surplusBalance,
    remainderDays
  };
};

// Get maternity leave analytics for a single member
export const getMaternityMemberAnalytics = (
  user: User,
  team: Team,
  approvedMaternityRequests: LeaveRequest[]
): MaternityMemberAnalytics => {
  // Get maternity leave settings (defaults if not set)
  const maxMaternityLeaveDays = team.settings.maternityLeave?.maxDays || 90;
  const countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
  
  const shiftSchedule = user.shiftSchedule || {
    pattern: [true, true, true, true, true, false, false],
    startDate: new Date(),
    type: 'fixed'
  };

  // Filter to only maternity leave requests
  const maternityRequests = approvedMaternityRequests.filter(req => {
    if (!req.reason) return false;
    return isMaternityLeave(req.reason);
  });

  // Convert to format expected by calculateMaternityLeaveBalance
  const maternityRequestsForCalculation = maternityRequests.map(req => ({
    startDate: new Date(req.startDate),
    endDate: new Date(req.endDate),
    reason: req.reason
  }));

  // Calculate base maternity leave balance
  const baseMaternityLeaveBalance = user.manualMaternityLeaveBalance !== undefined 
    ? user.manualMaternityLeaveBalance 
    : maxMaternityLeaveDays;

  // Calculate remaining maternity leave balance
  const remainingMaternityLeaveBalance = calculateMaternityLeaveBalance(
    maxMaternityLeaveDays,
    maternityRequestsForCalculation,
    countingMethod,
    shiftSchedule,
    user.manualMaternityLeaveBalance,
    user.manualMaternityYearToDateUsed
  );

  // Calculate maternity days used
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(currentYear, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let maternityDaysUsed = 0;
  if (user.manualMaternityYearToDateUsed !== undefined) {
    maternityDaysUsed = user.manualMaternityYearToDateUsed;
  } else {
    maternityDaysUsed = maternityRequestsForCalculation.reduce((total, req) => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      
      // Only count days within the current year and up to today
      if (reqStart <= yearEnd && reqEnd >= yearStart) {
        const overlapStart = reqStart > yearStart ? reqStart : yearStart;
        const overlapEnd = reqEnd < yearEnd ? (reqEnd < today ? reqEnd : today) : (today < yearEnd ? today : yearEnd);
        
        if (overlapEnd >= overlapStart) {
          const days = countMaternityLeaveDays(overlapStart, overlapEnd, countingMethod, shiftSchedule);
          return total + days;
        }
      }
      
      return total;
    }, 0);
  }

  // Calculate surplus maternity balance
  const surplusMaternityBalance = calculateMaternitySurplusBalance(
    user.manualMaternityLeaveBalance,
    maxMaternityLeaveDays
  );

  return {
    remainingMaternityLeaveBalance,
    baseMaternityLeaveBalance,
    maternityDaysUsed,
    surplusMaternityBalance
  };
};

// Get aggregate team analytics
// Get team analytics with aggregation
// 
// IMPORTANT: Aggregation logic must match getGroupedTeamAnalytics for consistency:
// - totalUsableDays: Sum unique groupUsableDays per group (not per member)
// - totalRealisticUsableDays: Sum individual realisticUsableDays within each group, then sum group totals
// - totalRemainderDays: Sum group remainders (not individual remainders)
// 
// The team object must be the same instance used for all member calculations
export const getTeamAnalytics = (
  members: User[],
  team: Team,
  allRequests: LeaveRequest[]
): TeamAnalytics => {
  const memberMembers = members.filter(m => m.role === 'member');
  
  // Get all approved requests for the team (needed for realistic calculations)
  const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
  
  const memberAnalytics = memberMembers.map(member => {
    // Filter to only approved requests for this member (matching leave balance page logic)
    const memberRequests = allRequests.filter(req => 
      req.userId === member._id && req.status === 'approved'
    );
    const analytics = getMemberAnalytics(
      member,
      team,
      memberRequests,
      allApprovedRequests,
      members
    );
    
    return {
      userId: member._id || '',
      username: member.username,
      fullName: member.fullName,
      analytics
    };
  });
  
  // Calculate aggregates
  // For totalUsableDays and totalRemainderDays, we need to group members first
  // because members in the same group share the same pool of usableDays
  // Group members by their tags (subgroupTag + shiftTag + workingDaysTag)
  const groupsMap = new Map<string, typeof memberAnalytics>();
  for (const memberAnalytic of memberAnalytics) {
    const member = memberMembers.find(m => m._id === memberAnalytic.userId);
    if (!member) continue;
    
    const subgroupTag = team.settings.enableSubgrouping 
      ? (member.subgroupTag || 'Ungrouped')
      : 'All';
    const shiftTag = member.shiftTag || 'no-tag';
    const workingDaysTag = member.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(member.shiftSchedule)
      : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule) || 'no-schedule');
    
    const groupKey = `${subgroupTag}_${shiftTag}_${workingDaysTag}`;
    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push(memberAnalytic);
  }
  
  // Calculate totalUsableDays, totalRemainderDays, and totalRealisticUsableDays from groups (not individual members)
  // 
  // AGGREGATION LOGIC (must match getGroupedTeamAnalytics):
  // - totalUsableDays: Sum unique groupUsableDays per group (shared pool, counted once per group)
  // - totalRealisticUsableDays: Sum individual realisticUsableDays within each group, then sum all group totals
  // - totalRemainderDays: Sum group remainders (each group has its own remainder calculation)
  // 
  // Note: groupUsableDays already accounts for concurrent leave constraints via calculateDateAvailability
  let totalUsableDays = 0;
  let totalRemainderDays = 0;
  let totalRealisticUsableDays = 0;
  for (const [, groupMembers] of groupsMap.entries()) {
    // All members in the same group should see the same usableDays (same shift, same tags)
    const groupUsableDays = groupMembers.length > 0 ? groupMembers[0].analytics.usableDays : 0;
    totalUsableDays += groupUsableDays; // Add each group's pool once (not per member)
    // Calculate remainder using iterative allocation that accounts for member constraints
    // Note: groupUsableDays already accounts for concurrent leave constraints
    totalRemainderDays += calculateGroupRemainderDays(groupUsableDays, groupMembers);
    
    // Calculate groupTotalRealisticUsableDays by summing individual member realisticUsableDays within the group
    // This accounts for individual member constraints (remainingBalance) while correctly grouping
    const groupTotalRealisticUsableDays = groupMembers.reduce((sum, m) => sum + m.analytics.realisticUsableDays, 0);
    totalRealisticUsableDays += groupTotalRealisticUsableDays;
  }
  
  const memberCount = memberAnalytics.length;
  
  const aggregate = {
    totalRemainingWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0), // Keep for backward compatibility
    totalTheoreticalWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalUsableDays,
    totalRealisticUsableDays,
    totalRemainderDays,
    totalRemainingLeaveBalance: memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0),
    totalWillCarryover: memberAnalytics.reduce((sum, m) => sum + m.analytics.willCarryover, 0),
    totalWillLose: memberAnalytics.reduce((sum, m) => sum + m.analytics.willLose, 0),
    averageRemainingBalance: memberCount > 0
      ? Math.round(memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0) / memberCount)
      : 0,
    membersCount: memberCount,
    averageDaysPerMemberAcrossTeam: memberCount > 0
      ? Math.floor(totalRealisticUsableDays / memberCount)
      : 0
  };
  
  return {
    aggregate,
    members: memberAnalytics
  };
};

// Get grouped team analytics for leaders
// If subgrouping is enabled: Groups members by subgroupTag first, then by workingDaysTag + shiftTag within subgroup
// If subgrouping is disabled: Groups members by workingDaysTag + shiftTag combinations
// 
// IMPORTANT: Aggregation logic must match getTeamAnalytics for consistency:
// - totalUsableDays: Sum unique groupTotalUsableDays per group (not per member)
// - totalRealisticUsableDays: Sum groupTotalRealisticUsableDays from each group
// - totalRemainderDays: Sum groupTotalRemainderDays from each group
// 
// The team object must be the same instance used for all member calculations to ensure
// concurrent leave settings are consistently applied
export const getGroupedTeamAnalytics = (
  members: User[],
  team: Team,
  allRequests: LeaveRequest[]
): GroupedTeamAnalytics => {
  // Validate team.settings before calculation
  if (!team || !team.settings) {
    console.error('[Analytics] getGroupedTeamAnalytics - ERROR: team.settings is missing!', {
      hasTeam: !!team,
      hasSettings: !!team?.settings
    });
    throw new Error('Team settings are missing');
  }
  
  if (typeof team.settings.concurrentLeave !== 'number' || team.settings.concurrentLeave < 1) {
    console.error('[Analytics] getGroupedTeamAnalytics - ERROR: team.settings.concurrentLeave is invalid!', {
      value: team.settings.concurrentLeave,
      type: typeof team.settings.concurrentLeave
    });
    throw new Error('Invalid concurrent leave setting');
  }
  
  // Debug: Log the concurrent leave value at the start of calculation
  if (typeof window === 'undefined') {
    console.log('[Analytics] getGroupedTeamAnalytics - team.settings.concurrentLeave:', team.settings.concurrentLeave);
  }
  
  const memberMembers = members.filter(m => m.role === 'member');
  
  // Get all approved requests for the team (needed for realistic calculations)
  const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
  
  // Calculate analytics for all members
  const memberAnalytics = memberMembers.map(member => {
    // Filter to only approved requests for this member (matching leave balance page logic)
    const memberRequests = allRequests.filter(req => {
      // Convert userId to string for comparison (handle both string and ObjectId types)
      const reqUserId = req.userId ? String(req.userId) : '';
      const memberId = member._id ? String(member._id) : '';
      return reqUserId === memberId && req.status === 'approved';
    });
    
    // Debug logging for specific users
    if (member.username === 'francisbentum' || member.username === 'edgemadzi') {
      console.log(`[DEBUG getGroupedTeamAnalytics] ${member.username}:`);
      console.log(`  member._id: ${member._id} (type: ${typeof member._id})`);
      console.log(`  memberRequests.length=${memberRequests.length}, manualLeaveBalance=${member.manualLeaveBalance}`);
      console.log(`  allRequests.length=${allRequests.length}`);
      memberRequests.forEach((req, idx) => {
        console.log(`  Request ${idx + 1}: userId=${req.userId} (type: ${typeof req.userId}), ${req.startDate} to ${req.endDate}, status=${req.status}`);
      });
      // Also check allRequests for this user
      const allUserRequests = allRequests.filter(req => {
        const reqUserId = req.userId ? String(req.userId) : '';
        const memberId = member._id ? String(member._id) : '';
        return reqUserId === memberId;
      });
      console.log(`  All requests for ${member.username}: ${allUserRequests.length}`);
      allUserRequests.forEach((req, idx) => {
        console.log(`    All Request ${idx + 1}: userId=${req.userId}, ${req.startDate} to ${req.endDate}, status=${req.status}`);
      });
    }
    
    const analytics = getMemberAnalytics(
      member,
      team,
      memberRequests,
      allApprovedRequests,
      members
    );
    
    // Debug logging for specific users
    if (member.username === 'francisbentum' || member.username === 'edgemadzi') {
      console.log(`[DEBUG getGroupedTeamAnalytics] ${member.username}: remainingLeaveBalance=${analytics.remainingLeaveBalance}, baseLeaveBalance=${analytics.baseLeaveBalance}`);
    }
    
    return {
      userId: member._id || '',
      username: member.username,
      fullName: member.fullName,
      member: member,
      analytics
    };
  });
  
  // If subgrouping is enabled, group by subgroup first, then by workingDaysTag + shiftTag
  // If subgrouping is disabled, group only by workingDaysTag + shiftTag
  const subgroupsMap = new Map<string, typeof memberAnalytics>();
  
  for (const memberAnalytic of memberAnalytics) {
    const member = memberAnalytic.member;
    
    if (team.settings.enableSubgrouping) {
      // Group by subgroup first
      const subgroupTag = member.subgroupTag || 'Ungrouped';
      const subgroupKey = subgroupTag;
      
      if (!subgroupsMap.has(subgroupKey)) {
        subgroupsMap.set(subgroupKey, []);
      }
      subgroupsMap.get(subgroupKey)!.push(memberAnalytic);
    } else {
      // No subgrouping - use default "All" subgroup
      const subgroupKey = 'All';
      
      if (!subgroupsMap.has(subgroupKey)) {
        subgroupsMap.set(subgroupKey, []);
      }
      subgroupsMap.get(subgroupKey)!.push(memberAnalytic);
    }
  }
  
  // Now within each subgroup, group by workingDaysTag + shiftTag
  const groupsMap = new Map<string, typeof memberAnalytics>();
  
  for (const [subgroupKey, subgroupMembers] of subgroupsMap.entries()) {
    for (const memberAnalytic of subgroupMembers) {
      const member = memberAnalytic.member;
      // For rotating schedules, always regenerate (tags change daily)
      // For fixed schedules, use stored tag or generate if missing
      const workingDaysTag = member.shiftSchedule?.type === 'rotating' 
        ? generateWorkingDaysTag(member.shiftSchedule)
        : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule) || 'no-schedule');
      const shiftTag = member.shiftTag || 'no-tag';
      const groupKey = `${subgroupKey}_${shiftTag}_${workingDaysTag}`;
      
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      groupsMap.get(groupKey)!.push(memberAnalytic);
    }
  }
  
  // Create groups with aggregates
  // Parse groupKey to extract subgroup, shiftTag, and workingDaysTag
  const groups = Array.from(groupsMap.entries()).map(([groupKey, groupMembers]) => {
    const member = groupMembers[0].member;
    
    // Parse groupKey: "subgroup_shiftTag_workingDaysTag" or "All_shiftTag_workingDaysTag"
    let subgroupTag: string | undefined;
    let shiftTag: string | undefined;
    let workingDaysTag: string;
    
    if (team.settings.enableSubgrouping) {
      // Format: "subgroup_shiftTag_workingDaysTag"
      const parts = groupKey.split('_');
      if (parts.length >= 3) {
        subgroupTag = parts[0] !== 'Ungrouped' ? parts[0] : undefined;
        shiftTag = parts[1] !== 'no-tag' ? parts[1] : undefined;
        workingDaysTag = parts.slice(2).join('_'); // In case workingDaysTag contains underscores
      } else {
        // Fallback parsing
        subgroupTag = member.subgroupTag;
        shiftTag = member.shiftTag;
        workingDaysTag = member.shiftSchedule?.type === 'rotating'
          ? generateWorkingDaysTag(member.shiftSchedule)
          : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule) || 'no-schedule');
      }
    } else {
      // Format: "All_shiftTag_workingDaysTag"
      const parts = groupKey.split('_');
      if (parts[0] === 'All' && parts.length >= 3) {
        shiftTag = parts[1] !== 'no-tag' ? parts[1] : undefined;
        workingDaysTag = parts.slice(2).join('_');
      } else {
        // Fallback
        shiftTag = member.shiftTag;
        workingDaysTag = member.shiftSchedule?.type === 'rotating'
          ? generateWorkingDaysTag(member.shiftSchedule)
          : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule) || 'no-schedule');
      }
    }
    
    const groupTotalMembers = groupMembers.length;
    // All members in the same group should see the same usableDays (same shift, same tags)
    // So we should use the usableDays from one member, not sum them
    // If we sum, we're multiplying the same value by number of members
    const groupUsableDays = groupMembers.length > 0 ? groupMembers[0].analytics.usableDays : 0;
    const groupTotalUsableDays = groupUsableDays; // This is the shared pool, not a sum
    const groupTotalRealisticUsableDays = groupMembers.reduce((sum, m) => sum + m.analytics.realisticUsableDays, 0);
    // Calculate remainder using iterative allocation that accounts for member constraints
    // This allocates days one by one, removing members when they reach their max,
    // and returns days that can't be allocated evenly
    // Note: groupUsableDays already accounts for concurrent leave constraints (only counts days with availability > 0)
    const groupTotalRemainderDays = calculateGroupRemainderDays(groupUsableDays, groupMembers);
    const groupTotalLeaveBalance = groupMembers.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0);
    
    return {
      groupKey,
      subgroupTag, // Add subgroupTag to group info
      shiftTag,
      workingDaysTag,
      aggregate: {
        groupTotalMembers,
        groupAverageRealisticUsableDays: groupTotalMembers > 0
          ? Math.floor(groupTotalRealisticUsableDays / groupTotalMembers)
          : 0,
        groupTotalUsableDays,
        groupTotalRealisticUsableDays,
        groupTotalRemainderDays,
        groupAverageLeaveBalance: groupTotalMembers > 0
          ? Math.round(groupTotalLeaveBalance / groupTotalMembers)
          : 0,
        groupTotalLeaveBalance,
        groupAverageUsableDays: groupTotalMembers > 0
          ? Math.round((groupTotalUsableDays / groupTotalMembers) * 10) / 10
          : 0,
      },
      members: groupMembers.map(m => ({
        userId: m.userId,
        username: m.username,
        fullName: m.fullName,
        analytics: m.analytics
      }))
    };
  });
  
  // Calculate overall aggregates (must match getTeamAnalytics aggregation logic)
  // 
  // AGGREGATION LOGIC (must match getTeamAnalytics):
  // - totalUsableDays: Sum unique groupTotalUsableDays per group (shared pool, counted once per group)
  // - totalRealisticUsableDays: Sum groupTotalRealisticUsableDays from each group
  // - totalRemainderDays: Sum groupTotalRemainderDays from each group
  // 
  // This ensures consistent results between getTeamAnalytics and getGroupedTeamAnalytics
  const totalUsableDays = groups.reduce((sum, group) => sum + group.aggregate.groupTotalUsableDays, 0);
  // For totalRealisticUsableDays, sum groupTotalRealisticUsableDays from each group
  // This correctly accounts for individual member constraints within each group's shared pool
  const totalRealisticUsableDays = groups.reduce((sum, group) => sum + group.aggregate.groupTotalRealisticUsableDays, 0);
  // For totalRemainderDays, sum remainders from each group (not individual members)
  // Each group has its own pool and remainder, so we sum group remainders
  const totalRemainderDays = groups.reduce((sum, group) => sum + group.aggregate.groupTotalRemainderDays, 0);
  const memberCount = memberAnalytics.length;
  
  const aggregate = {
    totalRemainingWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalTheoreticalWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalUsableDays,
    totalRealisticUsableDays,
    totalRemainderDays,
    totalRemainingLeaveBalance: memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0),
    totalWillCarryover: memberAnalytics.reduce((sum, m) => sum + m.analytics.willCarryover, 0),
    totalWillLose: memberAnalytics.reduce((sum, m) => sum + m.analytics.willLose, 0),
    averageRemainingBalance: memberCount > 0
      ? Math.round(memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0) / memberCount)
      : 0,
    membersCount: memberCount,
    averageDaysPerMemberAcrossTeam: memberCount > 0
      ? Math.floor(totalRealisticUsableDays / memberCount)
      : 0
  };
  
  return {
    aggregate,
    groups
  };
};

