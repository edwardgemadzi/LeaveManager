import { ShiftSchedule, User, Team, LeaveRequest } from '@/types';
import { countWorkingDays, calculateLeaveBalance, isWorkingDay, getWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays, calculateCarryoverBalance } from './leaveCalculations';
import { parseDateSafe } from './dateUtils';
import { debug } from './logger';

// Check if bypass notice period is active for a given team and date
export const isBypassNoticePeriodActive = (team: Team, date: Date = new Date()): boolean => {
  if (!team.settings.bypassNoticePeriod?.enabled) {
    return false;
  }
  
  const bypass = team.settings.bypassNoticePeriod;
  
  // Use parseDateSafe to handle both Date objects and strings safely
  if (!bypass.startDate || !bypass.endDate) {
    return false;
  }
  
  const checkDate = parseDateSafe(date);
  const startDate = parseDateSafe(bypass.startDate);
  const endDate = parseDateSafe(bypass.endDate);
  
  // Normalize all dates to midnight for consistent comparison
  checkDate.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return checkDate >= startDate && checkDate <= endDate;
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

// Get start and end dates of a calendar year (defaults to current year)
const getYearStart = (year?: number): Date => {
  const targetYear = year ?? new Date().getFullYear();
  return new Date(targetYear, 0, 1);
};

const getYearEnd = (year?: number): Date => {
  const targetYear = year ?? new Date().getFullYear();
  return new Date(targetYear, 11, 31);
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
  // IMPORTANT: Explicitly filter by status to ensure only approved requests are counted
  const overlappingRequests = allApprovedRequests.filter(req => {
    // Explicitly check status - only count approved requests
    if (req.status !== 'approved') return false;
    
    // Skip maternity leave requests
    if (req.reason && (req.reason.toLowerCase() === 'maternity' || req.reason.toLowerCase().includes('maternity') || req.reason.toLowerCase().includes('paternity'))) {
      return false;
    }
    
    const reqStart = parseDateSafe(req.startDate);
    const reqEnd = parseDateSafe(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    
    // Check if date falls within request range
    const overlaps = checkDate >= reqStart && checkDate <= reqEnd;
    
    return overlaps;
  });
  
  // Count only requests from users who:
  // 1. Work on this date (same working days)
  // 2. Have the same workingDaysTag (work on exactly the same days)
  // 3. Have the same shiftTag (day/night/mixed)
  let relevantCount = 0;
  
  for (const req of overlappingRequests) {
    // Skip user's own requests (they don't block themselves)
    // Convert both to strings for comparison (handle ObjectId and string types)
    const reqUserId = req.userId ? String(req.userId) : '';
    const checkUserId = userId ? String(userId) : '';
    if (reqUserId === checkUserId) {
      continue;
    }
    
    // Convert both to strings for comparison (handle ObjectId and string types)
    const reqUser = members.find(m => {
      const mId = m._id ? String(m._id) : '';
      return mId === reqUserId;
    });
    if (!reqUser) {
      continue;
    }
    
    // Only count if the requesting user also works on this date
    // Use User object to support historical schedules for past dates
    if (!isWorkingDay(checkDate, reqUser)) {
      continue;
    }
    
    // Check if they have the same workingDaysTag OR have partial overlap
    // For rotating schedules, always regenerate (tags change daily)
    // For fixed schedules, use stored tag or generate if missing
    const reqUserWorkingDaysTag = reqUser.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(reqUser.shiftSchedule)
      : (reqUser.workingDaysTag || generateWorkingDaysTag(reqUser.shiftSchedule));
    
    let hasWorkingDaysOverlap = false;
    if (userWorkingDaysTag !== undefined) {
      // Check for exact tag match (100% overlap)
      if (reqUserWorkingDaysTag === userWorkingDaysTag) {
        hasWorkingDaysOverlap = true;
      } else {
        // Check for partial overlap (some intersecting working days)
        // Only check if both users have shift schedules
        if (userShiftSchedule && reqUser.shiftSchedule) {
          hasWorkingDaysOverlap = detectPartialOverlap(userShiftSchedule, reqUser.shiftSchedule, 30);
        }
      }
    } else {
      // If user has no workingDaysTag, check for partial overlap
      if (userShiftSchedule && reqUser.shiftSchedule) {
        hasWorkingDaysOverlap = detectPartialOverlap(userShiftSchedule, reqUser.shiftSchedule, 30);
      }
    }
    
    // If no working days overlap (neither exact nor partial), skip this member
    if (!hasWorkingDaysOverlap) {
      continue;
    }
    
    // Check if they have the same shiftTag
    if (userShiftTag !== undefined) {
      if (reqUser.shiftTag !== userShiftTag) {
        continue;
      }
    } else {
      // User has no shift tag - only count members with no shift tag
      if (reqUser.shiftTag !== undefined) {
        continue;
      }
    }
    
    // Check subgroup if subgrouping is enabled
    if (team.settings.enableSubgrouping) {
      // Get requesting user's subgroup (or "Ungrouped")
      const userSubgroup = userSubgroupTag || 'Ungrouped';
      // Get request user's subgroup (or "Ungrouped")
      const reqUserSubgroup = reqUser.subgroupTag || 'Ungrouped';
      
      // Only count if they're in the same subgroup
      if (userSubgroup !== reqUserSubgroup) {
        continue;
      }
    }
    
    // This member qualifies - they work on this day, have same tag or partial overlap, same shift tag, and same subgroup
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
  shiftSchedule: ShiftSchedule,
  targetYear?: number // Optional year parameter for historical data
): number => {
  const currentYear = targetYear ?? new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = getYearStart(currentYear);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = getYearEnd(currentYear);
  yearEnd.setHours(23, 59, 59, 999);
  
  // For historical years, calculate from start of year to end of year
  // For current year, calculate from today (or earliest requestable date) to end of year
  const isHistoricalYear = currentYear < today.getFullYear();
  
  // Check if bypass notice period is active (only relevant for current year)
  const bypassActive = !isHistoricalYear && isBypassNoticePeriodActive(team, today);
  
  // Calculate earliest requestable date based on notice period (unless bypass is active or historical year)
  let earliestRequestableDate = isHistoricalYear ? yearStart : today;
  if (!isHistoricalYear && !bypassActive) {
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
  
  // Get all working days in the period (from earliest requestable date to end of year)
  const remainingWorkingDays = getWorkingDays(earliestRequestableDate, yearEnd, shiftSchedule);
  
  // Count days that have availability (slots > 0) among members with same tag
  let usableDays = 0;

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
    
    // If there's at least one available slot, this day is usable
    if (availability > 0) {
      usableDays++;
    }
  }
  
  return usableDays;
};

/**
 * Detect if two shift schedules have ANY intersecting working days (partial overlap)
 * Checks over a specified period (default 30 days) to find at least one day where both work
 * 
 * @param schedule1 - First shift schedule
 * @param schedule2 - Second shift schedule
 * @param checkPeriodDays - Number of days to check (default: 30)
 * @returns true if schedules have at least one intersecting working day, false otherwise
 */
export const detectPartialOverlap = (
  schedule1: ShiftSchedule | undefined,
  schedule2: ShiftSchedule | undefined,
  checkPeriodDays: number = 30
): boolean => {
  // If either schedule is missing, no overlap
  if (!schedule1 || !schedule2) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check each day in the period
  for (let i = 0; i < checkPeriodDays; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    
    const works1 = isWorkingDay(checkDate, schedule1);
    const works2 = isWorkingDay(checkDate, schedule2);
    
    // If both work on this day, we have partial overlap
    if (works1 && works2) {
      return true;
    }
  }
  
  // No overlap found in the check period
  return false;
};

/**
 * Find members who have partial overlap with a given user
 * 
 * @param user - User to check overlap for
 * @param allMembers - List of all team members
 * @param checkPeriodDays - Number of days to check (default: 30)
 * @returns Array of members who have partial overlap with the user
 */
export const findMembersWithPartialOverlap = (
  user: User,
  allMembers: User[],
  checkPeriodDays: number = 30
): User[] => {
  if (!user.shiftSchedule) {
    return [];
  }

  const overlappingMembers: User[] = [];
  
  for (const member of allMembers) {
    // Skip the user themselves
    if (member._id === user._id) {
      continue;
    }
    
    // Skip members without shift schedules
    if (!member.shiftSchedule) {
      continue;
    }
    
    // Check for partial overlap
    if (detectPartialOverlap(user.shiftSchedule, member.shiftSchedule, checkPeriodDays)) {
      overlappingMembers.push(member);
    }
  }
  
  return overlappingMembers;
};

/**
 * Group members by partial overlap (transitive grouping)
 * Members with partial overlap are grouped together, even if they don't directly overlap
 * Example: A overlaps B, B overlaps C → A, B, C are in the same group
 * 
 * @param members - List of all team members
 * @param checkPeriodDays - Number of days to check for overlap (default: 30)
 * @returns Map of group IDs to arrays of members in that group
 */
export const groupMembersByPartialOverlap = (
  members: User[],
  checkPeriodDays: number = 30
): Map<string, User[]> => {
  const groups = new Map<string, User[]>();
  const processed = new Set<string>();
  
  for (const member of members) {
    // Skip if already processed
    if (!member._id || processed.has(member._id)) {
      continue;
    }
    
    // Skip members without shift schedules
    if (!member.shiftSchedule) {
      continue;
    }
    
    // Start a new group with this member
    const group: User[] = [member];
    processed.add(member._id);
    
    // Find all members with partial overlap (transitive)
    const toCheck: User[] = [member];
    while (toCheck.length > 0) {
      const current = toCheck.pop()!;
      if (!current.shiftSchedule) continue;
      
      for (const other of members) {
        // Skip if already processed or no ID
        if (!other._id || processed.has(other._id)) {
          continue;
        }
        
        // Skip if no shift schedule
        if (!other.shiftSchedule) {
          continue;
        }
        
        // Check for partial overlap
        if (detectPartialOverlap(current.shiftSchedule, other.shiftSchedule, checkPeriodDays)) {
          group.push(other);
          toCheck.push(other);
          processed.add(other._id);
        }
      }
    }
    
    // Assign group ID (use first member's ID)
    const groupId = member._id;
    groups.set(groupId, group);
  }
  
  return groups;
};

/**
 * Suggest subgroup assignments based on partial overlap
 * Groups members with partial overlap together and suggests subgroup assignments
 * 
 * @param members - List of all team members
 * @param existingSubgroups - List of existing subgroup names
 * @param checkPeriodDays - Number of days to check for overlap (default: 30)
 * @returns Object containing suggested assignments and conflicts
 */
export interface SubgroupSuggestion {
  memberId: string;
  suggestedSubgroup: string;
  reason: 'partial-overlap' | 'manual-override';
  overlappingMembers: string[]; // IDs of members with partial overlap
}

export interface SubgroupSuggestions {
  suggestions: SubgroupSuggestion[];
  conflicts: Array<{
    memberId: string;
    currentSubgroup: string;
    suggestedSubgroup: string;
    reason: string;
  }>;
}

export const suggestSubgroupAssignments = (
  members: User[],
  existingSubgroups: string[],
  checkPeriodDays: number = 30
): SubgroupSuggestions => {
  // Group members by partial overlap
  const overlapGroups = groupMembersByPartialOverlap(members, checkPeriodDays);
  
  // If no subgroups exist, return empty suggestions
  if (!existingSubgroups || existingSubgroups.length === 0) {
    return {
      suggestions: [],
      conflicts: [],
    };
  }
  
  const suggestions: SubgroupSuggestion[] = [];
  const conflicts: Array<{
    memberId: string;
    currentSubgroup: string;
    suggestedSubgroup: string;
    reason: string;
  }> = [];
  
  // Create a map of member ID to current subgroup
  const memberSubgroupMap = new Map<string, string>();
  for (const member of members) {
    if (member._id) {
      memberSubgroupMap.set(member._id, member.subgroupTag || 'Ungrouped');
    }
  }
  
  // Assign each overlap group to a subgroup
  let subgroupIndex = 0;
  for (const [, groupMembers] of overlapGroups.entries()) {
    // Assign to next available subgroup (round-robin if more groups than subgroups)
    const suggestedSubgroup = existingSubgroups[subgroupIndex % existingSubgroups.length];
    
    for (const member of groupMembers) {
      if (!member._id) continue;
      
      const currentSubgroup = memberSubgroupMap.get(member._id) || 'Ungrouped';
      
      // Get IDs of overlapping members
      const overlappingMemberIds = groupMembers
        .filter(m => m._id !== member._id && m._id)
        .map(m => m._id!);
      
      // Add suggestion
      suggestions.push({
        memberId: member._id,
        suggestedSubgroup,
        reason: 'partial-overlap',
        overlappingMembers: overlappingMemberIds,
      });
      
      // Check for conflicts (member in different subgroup than suggested)
      if (currentSubgroup !== suggestedSubgroup && currentSubgroup !== 'Ungrouped') {
        conflicts.push({
          memberId: member._id,
          currentSubgroup,
          suggestedSubgroup,
          reason: `Has partial overlap with members in ${suggestedSubgroup}`,
        });
      }
    }
    
    subgroupIndex++;
  }
  
  return {
    suggestions,
    conflicts,
  };
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
// Also includes members with partial overlap (some intersecting working days)
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
  
  // Count members who have the exact same working days tag OR partial overlap, shift tag, and subgroup tag
  // IMPORTANT: All conditions must be true - (working days OR partial overlap) AND shift tag AND subgroup
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
    
    // FIRST: Must have exact same working days pattern OR partial overlap
    let hasWorkingDaysOverlap = false;
    if (memberWorkingDaysTag === userWorkingDaysTag) {
      // Exact match (100% overlap)
      hasWorkingDaysOverlap = true;
    } else {
      // Check for partial overlap (some intersecting working days)
      if (user.shiftSchedule && member.shiftSchedule) {
        hasWorkingDaysOverlap = detectPartialOverlap(user.shiftSchedule, member.shiftSchedule, 30);
      }
    }
    
    if (!hasWorkingDaysOverlap) {
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
    return 0; // All members have 0 balance, no one can use days - no remainder to allocate
  }
  
  let pool = groupUsableDays; // Days available for allocation
  
  // Phase 1: Base allocation - give each member floor(pool / availableMembers)
  // Only allocate to members with balance > 0 (zero-balance members are excluded)
  const baseAllocation = Math.floor(pool / availableMembers.length);
  
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
  allowCarryover: boolean,
  carryoverSettings?: {
    limitedToMonths?: number[];
    maxCarryoverDays?: number;
    expiryDate?: Date;
  }
): { willCarryover: number; willLose: number; limitedToMonths?: number[]; maxCarryoverDays?: number; expiryDate?: Date } => {
  // Calculate days that cannot be used this year
  // If remaining leave > remaining working days, the excess will either carry over or be lost
  // If remaining leave <= remaining working days, nothing carries over (they can use all their leave)
  let unusedDays = Math.max(0, remainingLeaveBalance - remainingWorkingDays);
  
  if (!allowCarryover) {
    return {
      willCarryover: 0,
      willLose: unusedDays
    };
  }

  // Check if carryover has an expiry date that has already passed
  // If expiry date is in the past, no days will carry over
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (carryoverSettings?.expiryDate) {
    const expiryDate = new Date(carryoverSettings.expiryDate);
    expiryDate.setHours(0, 0, 0, 0);
    
    // If expiry date is in the past, all unused days will be lost
    if (expiryDate < today) {
      return {
        willCarryover: 0,
        willLose: unusedDays,
        limitedToMonths: carryoverSettings.limitedToMonths,
        maxCarryoverDays: carryoverSettings.maxCarryoverDays,
        expiryDate: carryoverSettings.expiryDate
      };
    }
  }
  
  // Check if carryover is limited to months and those months have already passed
  // If all limited months are in the past, no days will carry over
  if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0) {
    const nextYear = new Date().getFullYear() + 1;
    const lastAllowedMonth = Math.max(...carryoverSettings.limitedToMonths);
    const lastAllowedMonthEnd = new Date(nextYear, lastAllowedMonth + 1, 0);
    lastAllowedMonthEnd.setHours(23, 59, 59, 999);
    
    // If the last allowed month has already passed, no days will carry over
    if (lastAllowedMonthEnd < today) {
      return {
        willCarryover: 0,
        willLose: unusedDays,
        limitedToMonths: carryoverSettings.limitedToMonths,
        maxCarryoverDays: carryoverSettings.maxCarryoverDays,
        expiryDate: carryoverSettings.expiryDate
      };
    }
  }

  // Apply max carryover days limit if set
  if (carryoverSettings?.maxCarryoverDays !== undefined && unusedDays > carryoverSettings.maxCarryoverDays) {
    const willLose = unusedDays - carryoverSettings.maxCarryoverDays;
    unusedDays = carryoverSettings.maxCarryoverDays;
    return {
      willCarryover: unusedDays,
      willLose,
      limitedToMonths: carryoverSettings.limitedToMonths,
      maxCarryoverDays: carryoverSettings.maxCarryoverDays,
      expiryDate: carryoverSettings.expiryDate
    };
  }

  return {
    willCarryover: unusedDays,
    willLose: 0,
    limitedToMonths: carryoverSettings?.limitedToMonths,
    maxCarryoverDays: carryoverSettings?.maxCarryoverDays,
    expiryDate: carryoverSettings?.expiryDate
  };
};

// Analytics data structure for a member
export interface MemberAnalytics {
  remainingWorkingDays: number; // Theoretical working days remaining (kept for backward compatibility)
  theoreticalWorkingDays: number; // Total working days remaining from today to end of year - NOT adjusted for concurrent leave sharing (raw count)
  usableDays: number; // Days that can be used when shared among members who can use them - adjusted for concurrent leave limits
  realisticUsableDays: number; // Realistic days factoring in members sharing same schedule who also need to use remaining leave days (whole days per member)
  remainingLeaveBalance: number; // Remaining balance after subtracting approved requests
  baseLeaveBalance: number; // Base balance (manualLeaveBalance if set, otherwise maxLeavePerYear) - before subtracting approved requests
  carryoverBalance: number; // Available carryover balance from previous year (separate stat)
  workingDaysUsed: number;
  workingDaysInYear: number;
  willCarryover: number;
  willLose: number;
  allowCarryover: boolean;
  carryoverLimitedToMonths?: number[]; // Array of month indices (0-11) where carryover can be used
  carryoverMaxDays?: number; // Maximum days that can carry over
  carryoverExpiryDate?: Date; // Date when carryover days expire
  membersSharingSameShift: number; // Total members competing for same days (includes exact match and partial overlap)
  averageDaysPerMember: number; // Average realistic days per member in same shift (whole days)
  surplusBalance: number; // Surplus balance when manual balance exceeds team max
  remainderDays: number; // Extra days that need allocation decisions (remainder from usableDays / membersSharingSameShift)
  realisticCarryoverUsableDays?: number; // Realistic usable days for carryover balance, considering limitations (if any)
  hasPartialCompetition: boolean; // True if there are members with partial overlap (not exact workingDaysTag match)
  partialOverlapMembersCount: number; // Number of members with partial overlap (not exact match)
  partialOverlapMembersWithBalance: number; // Number of partial overlap members who have leave balances
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
  allMembers: User[],
  targetYear?: number // Optional year parameter for historical data
): MemberAnalytics => {
  const currentYear = targetYear ?? new Date().getFullYear();
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

  // Calculate year start and end dates first (needed for multiple calculations)
  const yearStart = getYearStart(currentYear);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = getYearEnd(currentYear);
  yearEnd.setHours(23, 59, 59, 999);
  
  // Calculate theoretical remaining working days in year
  // This is the raw count of working days remaining - NOT adjusted for concurrent leave sharing
  // For historical years, calculate from start to end of year (not "remaining")
  const today = new Date();
  const isHistoricalYear = currentYear < today.getFullYear();
  const theoreticalWorkingDays = isHistoricalYear
    ? countWorkingDays(yearStart, yearEnd, shiftSchedule)
    : calculateRemainingWorkingDaysInYear(shiftSchedule);
  
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
  
  // Filter out maternity/paternity leave requests from regular leave calculations
  // Maternity/paternity leave uses a separate pool and shouldn't affect regular leave availability
  const regularApprovedRequests = allApprovedRequests.filter(req => 
    !req.reason || !isMaternityLeave(req.reason)
  );
  
  // Calculate remaining leave balance first (needed for filtering)
  // Note: approvedRequests parameter should already be filtered to approved requests
  // But we filter again here for safety and consistency with leave balance page
  // Include reason field so calculateLeaveBalance can filter out maternity leave
  const approvedRequestsForCalculation = approvedRequests
    .filter(req => req.status === 'approved')
    .map(req => ({
      startDate: parseDateSafe(req.startDate),
      endDate: parseDateSafe(req.endDate),
      reason: req.reason
    }));
  
  // Calculate base balance (same simplified logic as calculateLeaveBalance):
  // - If manualLeaveBalance is set, always use it as base (whether above or below maxLeavePerYear)
  // - If manualLeaveBalance is not set, use maxLeavePerYear
  const baseLeaveBalance = user.manualLeaveBalance !== undefined ? user.manualLeaveBalance : team.settings.maxLeavePerYear;
  
  // Use User object to support historical schedules for past dates
  const remainingLeaveBalance = calculateLeaveBalance(
    team.settings.maxLeavePerYear,
    approvedRequestsForCalculation,
    user,
    user.manualLeaveBalance,
    user.manualYearToDateUsed,
    team.settings.carryoverSettings
  );
  
  // Filter members to only include those with remaining balance > 0 for competition calculations
  // Members with 0 remaining balance should not affect realistic usable days calculations
  // This ensures partial overlap members with zero balance don't dilute the allocation
  const membersWithRemainingBalance = membersWithNonZeroBase.filter(member => {
    const memberRemainingBalance = calculateLeaveBalance(
      team.settings.maxLeavePerYear,
      allApprovedRequests.filter(req => req.userId === member._id),
      member,
      member.manualLeaveBalance,
      member.manualYearToDateUsed,
      team.settings.carryoverSettings
    );
    return memberRemainingBalance > 0;
  });
  
  // Calculate usable days using all filtered members (same subgroup)
  // This includes members with zero base balance because their approved requests still block days
  // However, only members with remaining balance > 0 will be counted in membersSharingSameShift
  // This ensures:
  // 1. Approved requests from ALL members in the same subgroup block days (correct availability)
  // 2. Only members who can actually use days are counted in competition (correct allocation)
  // IMPORTANT: Use filteredMembers (not membersWithNonZeroBase) so requests from members with 0 balance still block days
  const usableDays = calculateUsableDays(
    user,
    team,
    regularApprovedRequests, // Only regular leave requests (exclude maternity/paternity)
    filteredMembers, // Include ALL members in same subgroup (their requests block days, even if they have 0 balance)
    shiftSchedule,
    currentYear
  );
  
  // Calculate total working days in year
  const workingDaysInYear = countWorkingDays(yearStart, yearEnd, shiftSchedule);
  
  // Calculate working days used year-to-date from approved requests
  // Filter out maternity leave requests from regular leave calculations
  const approvedRegularRequests = approvedRequests.filter(req => 
    !req.reason || !isMaternityLeave(req.reason)
  );
  
  // Calculate working days used from approved requests in the current year
  // Use User object to support historical schedules for past dates
  const yearToDateWorkingDays = approvedRegularRequests.reduce((total, req) => {
    const start = parseDateSafe(req.startDate);
    const end = parseDateSafe(req.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Only count days within the current year
    if (start <= yearEnd && end >= yearStart) {
      const overlapStart = start > yearStart ? start : yearStart;
      const overlapEnd = end < yearEnd ? end : yearEnd;
      
      if (overlapEnd >= overlapStart) {
        // Use User object to support historical schedules for past dates
        return total + countWorkingDays(overlapStart, overlapEnd, user);
      }
    }
    return total;
  }, 0);
  
  // Use manualYearToDateUsed if set, otherwise use calculated value
  const workingDaysUsed = user.manualYearToDateUsed !== undefined 
    ? user.manualYearToDateUsed 
    : yearToDateWorkingDays;
  
  // Calculate carryover balance separately
  // Pass approvedRequests and carryoverSettings to account for month limitations
  const carryoverBalance = calculateCarryoverBalance(
    user, 
    workingDaysUsed,
    approvedRequestsForCalculation,
    team.settings.carryoverSettings
  );
  
  // Calculate surplus balance
  const surplusBalance = calculateSurplusBalance(user.manualLeaveBalance, team.settings.maxLeavePerYear);
  
  // Calculate competition metrics (using filtered members if subgrouping is enabled)
  // Only include members with remaining balance > 0 in competition calculations
  // This ensures members with zero balance (including partial overlap members) don't affect calculations
  const membersSharingSameShift = calculateMembersSharingSameShift(user, membersWithRemainingBalance);
  
  // Calculate partial overlap members (members with partial overlap but not exact workingDaysTag match)
  const userWorkingDaysTag = user.shiftSchedule?.type === 'rotating'
    ? generateWorkingDaysTag(user.shiftSchedule)
    : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule));
  const userShiftTag = user.shiftTag;
  const userSubgroupTag = user.subgroupTag;
  
  const partialOverlapMembers: User[] = [];
  const partialOverlapMembersWithBalance: User[] = [];
  
  // Calculate partial overlap members - only check members with remaining balance > 0
  // Members with zero balance should not be counted in partial overlap competition
  for (const member of membersWithRemainingBalance) {
    // Skip self
    if (!member._id || !user._id || String(member._id).trim() === String(user._id).trim()) {
      continue;
    }
    
    // Get member's working days tag
    const memberWorkingDaysTag = member.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(member.shiftSchedule)
      : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule));
    const memberShiftTag = member.shiftTag;
    const memberSubgroupTag = member.subgroupTag;
    
    // Check if they have exact match - if so, skip (not partial overlap)
    if (memberWorkingDaysTag === userWorkingDaysTag) {
      continue;
    }
    
    // Check for partial overlap
    if (user.shiftSchedule && member.shiftSchedule) {
      if (detectPartialOverlap(user.shiftSchedule, member.shiftSchedule, 30)) {
        // Check shift tag match
        let shiftTagMatches = false;
        if (userShiftTag !== undefined) {
          shiftTagMatches = memberShiftTag === userShiftTag;
        } else {
          shiftTagMatches = memberShiftTag === undefined;
        }
        
        if (!shiftTagMatches) {
          continue;
        }
        
        // Check subgroup match (if subgrouping is enabled)
        if (team.settings.enableSubgrouping) {
          const userSubgroup = userSubgroupTag || 'Ungrouped';
          const memberSubgroup = memberSubgroupTag || 'Ungrouped';
          if (userSubgroup !== memberSubgroup) {
            continue;
          }
        }
        
        // This member has partial overlap and has remaining balance > 0
        partialOverlapMembers.push(member);
        
        // Member already has remaining balance > 0 (filtered above)
        partialOverlapMembersWithBalance.push(member);
      }
    }
  }
  
  const hasPartialCompetition = partialOverlapMembers.length > 0;
  const partialOverlapMembersCount = partialOverlapMembers.length;
  const partialOverlapMembersWithBalanceCount = partialOverlapMembersWithBalance.length;
  
  // Calculate realistic usable days - factors in members sharing same schedule
  // This accounts for concurrent leave limit - if members <= concurrentLeave,
  // each member can use all usableDays (enough slots per day for all members)
  // If members > concurrentLeave, slots are divided proportionally
  // IMPORTANT: All members in the same group should get the same base allocation
  // Only then should it be capped by individual remaining balance
  const allowCarryover = team.settings.allowCarryover || false;
  const carryoverSettings = team.settings.carryoverSettings;
  
  // Calculate base allocation per member (same for all members in the group)
  // This is for the CURRENT YEAR only - not affected by carryover limitations
  // IMPORTANT: Account for concurrent leave limit - if members <= concurrentLeave,
  // each member can use all usableDays (enough slots per day for all members)
  const concurrentLeave = team.settings.concurrentLeave || 1;
  let baseAllocationPerMember: number;
  
  if (membersSharingSameShift <= concurrentLeave) {
    // Enough slots per day for all members - each can use all usable days
    baseAllocationPerMember = usableDays;
  } else {
    // More members than slots - divide slots proportionally
    // Formula: usableDays * (concurrentLeave / membersSharingSameShift)
    baseAllocationPerMember = Math.floor((usableDays * concurrentLeave) / membersSharingSameShift);
  }
  
  // Cap by remaining leave balance (this is the only member-specific constraint)
  // Realistic usable days for current year - NOT adjusted for carryover limitations
  // If baseAllocationPerMember is 0 but member has balance > 0 and there are usable days,
  // ensure they get at least 1 day (if their balance allows)
  let realisticUsableDays = Math.min(baseAllocationPerMember, remainingLeaveBalance);
  
  // If the calculation resulted in 0 but member has balance > 0 and there are usable days,
  // give them at least 1 day (if their balance allows)
  if (realisticUsableDays === 0 && usableDays > 0 && remainingLeaveBalance > 0) {
    realisticUsableDays = Math.min(1, remainingLeaveBalance);
  }
  
  // Calculate remainder days - extra slots that need allocation decisions
  // Remainder is the leftover slots after allocating slots proportionally
  // If members <= concurrentLeave: no remainder (each gets all usable days)
  // If members > concurrentLeave: remainder = leftover slots that can't be split equally
  // Example: 100 usable days, 6 concurrent leave, 10 members
  //   Total slots = 100 * 6 = 600
  //   Each member gets floor(600 / 10) = 60 slots
  //   Remainder = 600 % 10 = 0 (no leftover)
  // Example: 100 usable days, 6 concurrent leave, 7 members
  //   Total slots = 100 * 6 = 600
  //   Each member gets floor(600 / 7) = 85 slots
  //   Remainder = 600 % 7 = 5 slots (leftover that can't be split equally)
  const remainderDays = membersSharingSameShift > 0 && membersSharingSameShift > concurrentLeave
    ? (usableDays * concurrentLeave) % membersSharingSameShift
    : 0;
  
  const averageDaysPerMember = calculateAverageDaysPerMember(usableDays, membersSharingSameShift);
  
  // Calculate carryover/loss using realistic usable days (not theoretical)
  const carryoverResult = calculateCarryoverDays(
    remainingLeaveBalance,
    realisticUsableDays,
    allowCarryover,
    carryoverSettings
  );
  
  // Calculate realistic usable days for carryover balance (if any will carry over)
  // This considers carryover limitations (limited months, max days, expiry)
  let realisticCarryoverUsableDays: number | undefined = undefined;
  
  if (allowCarryover && carryoverResult.willCarryover > 0) {
    // If carryover is limited to specific months, calculate realistic usage
    // Days that can only be used in limited months have a narrower window
    if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0) {
      // Carryover days are for NEXT YEAR, so limited months are in the future
      // Calculate actual working days available in the limited months of next year
      const nextYear = new Date().getFullYear() + 1;
      let totalWorkingDaysInLimitedMonths = 0;
      
      for (const monthIndex of carryoverSettings.limitedToMonths) {
        // Create date for the first day of the limited month in next year
        const monthStart = new Date(nextYear, monthIndex, 1);
        monthStart.setHours(0, 0, 0, 0);
        
        // Create date for the last day of the limited month in next year
        const monthEnd = new Date(nextYear, monthIndex + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        // Count working days in this month (using user's shift schedule)
        const workingDaysInMonth = countWorkingDays(monthStart, monthEnd, shiftSchedule);
        totalWorkingDaysInLimitedMonths += workingDaysInMonth;
      }
      
      // Realistic usage is the minimum of:
      // 1. Days that will carry over
      // 2. Working days available in limited months
      // This ensures we don't show more usable days than are actually available
      realisticCarryoverUsableDays = Math.min(
        carryoverResult.willCarryover,
        totalWorkingDaysInLimitedMonths
      );
    } else {
      // No month limitations - carryover days can be used throughout the year
      // But still consider max carryover days and expiry if set
      realisticCarryoverUsableDays = carryoverResult.willCarryover;
    }
  }
  
  return {
    remainingWorkingDays: theoreticalWorkingDays, // Keep for backward compatibility
    theoreticalWorkingDays,
    usableDays,
    realisticUsableDays,
    remainingLeaveBalance,
    baseLeaveBalance,
    carryoverBalance,
    workingDaysUsed,
    workingDaysInYear,
    willCarryover: carryoverResult.willCarryover,
    willLose: carryoverResult.willLose,
    allowCarryover,
    carryoverLimitedToMonths: carryoverResult.limitedToMonths,
    carryoverMaxDays: carryoverResult.maxCarryoverDays,
    carryoverExpiryDate: carryoverResult.expiryDate,
    membersSharingSameShift,
    averageDaysPerMember,
    surplusBalance,
    remainderDays,
    realisticCarryoverUsableDays,
    hasPartialCompetition,
    partialOverlapMembersCount,
    partialOverlapMembersWithBalance: partialOverlapMembersWithBalanceCount
  };
};

// Get maternity leave analytics for a single member
export const getMaternityMemberAnalytics = (
  user: User,
  team: Team,
  approvedMaternityRequests: LeaveRequest[]
): MaternityMemberAnalytics => {
  // Determine which type of leave the user is assigned
  const userType = user.maternityPaternityType;
  
  // Get appropriate leave settings based on user's assigned type
  // Default to maternity if type is not assigned (backward compatibility)
  let maxLeaveDays: number;
  let countingMethod: 'calendar' | 'working';
  
  if (userType === 'paternity') {
    maxLeaveDays = team.settings.paternityLeave?.maxDays || 90;
    countingMethod = team.settings.paternityLeave?.countingMethod || 'working';
  } else {
    // Default to maternity (for backward compatibility or if type is 'maternity' or null)
    maxLeaveDays = team.settings.maternityLeave?.maxDays || 90;
    countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
  }
  
  const shiftSchedule = user.shiftSchedule || {
    pattern: [true, true, true, true, true, false, false],
    startDate: new Date(),
    type: 'fixed'
  };

  // Filter requests based on user's assigned type
  // If user is assigned paternity, only count paternity requests
  // If user is assigned maternity (or not assigned), only count maternity requests
  const maternityRequests = approvedMaternityRequests.filter(req => {
    if (!req.reason) return false;
    const isMaternity = isMaternityLeave(req.reason);
    
    if (userType === 'paternity') {
      // For paternity users, only count paternity requests
      const lowerReason = req.reason.toLowerCase();
      return lowerReason.includes('paternity') && !lowerReason.includes('maternity');
    } else {
      // For maternity users (or unassigned), only count maternity requests
      const lowerReason = req.reason.toLowerCase();
      return lowerReason.includes('maternity') || (isMaternity && !lowerReason.includes('paternity'));
    }
  });

  // Convert to format expected by calculateMaternityLeaveBalance
  const maternityRequestsForCalculation = maternityRequests.map(req => ({
    startDate: parseDateSafe(req.startDate),
    endDate: parseDateSafe(req.endDate),
    reason: req.reason
  }));

  // Calculate base maternity leave balance
  const baseMaternityLeaveBalance = user.manualMaternityLeaveBalance !== undefined 
    ? user.manualMaternityLeaveBalance 
    : maxLeaveDays;

  // Calculate remaining maternity leave balance
  const remainingMaternityLeaveBalance = calculateMaternityLeaveBalance(
    maxLeaveDays,
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
      const reqStart = parseDateSafe(req.startDate);
      const reqEnd = parseDateSafe(req.endDate);
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
    maxLeaveDays
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
  allRequests: LeaveRequest[],
  targetYear?: number // Optional year parameter for historical data
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
      members,
      targetYear
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
    // However, members might have different shift schedules (different start dates for rotating schedules)
    // which can result in different working days in the date range, leading to different usable days.
    // To ensure consistency, we use the minimum usable days across all members in the group.
    const allUsableDays = groupMembers.map(m => m.analytics.usableDays);
    const groupUsableDays = groupMembers.length > 0 ? Math.min(...allUsableDays) : 0;
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
  allRequests: LeaveRequest[],
  targetYear?: number // Optional year parameter for historical data
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
    
    const analytics = getMemberAnalytics(
      member,
      team,
      memberRequests,
      allApprovedRequests,
      members,
      targetYear
    );
    
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
    // All members in the same group share the same working days and schedule
    // Therefore, they should all have the same usable days.
    // Use the minimum usable days across all members in the group to ensure consistency.
    // This represents the shared pool of available days for the group.
    let groupUsableDays = 0;
    if (groupMembers.length > 0) {
      const allUsableDays = groupMembers.map(m => m.analytics.usableDays);
      groupUsableDays = Math.min(...allUsableDays);
      
      // Normalize all members in the group to have the same usable days
      // Since they share the same working days and schedule, they should all see the same value
      for (const memberAnalytic of groupMembers) {
        memberAnalytic.analytics.usableDays = groupUsableDays;
      }
      
      // Recalculate realistic usable days based on the shared pool
      // This ensures fair distribution of the shared pool among members based on their remaining balance
      // IMPORTANT: Use the same logic as getMemberAnalytics - membersSharingSameShift includes self
      // So we need to count members with balance > 0, which represents the competition pool
      const concurrentLeave = team.settings.concurrentLeave || 1;
      const membersWithBalance = groupMembers.filter(m => m.analytics.remainingLeaveBalance > 0);
      // membersSharingSameShift includes self, so for a group it's the count of members with balance > 0
      // Since we're already in a group (same working days, shift, subgroup), we just need the count
      const membersSharingSameShift = membersWithBalance.length;
      
      if (membersSharingSameShift > 0) {
        // Calculate base allocation per member from the shared pool
        // Use the same formula as getMemberAnalytics: usableDays * (concurrentLeave / membersSharingSameShift)
        let baseAllocationPerMember: number;
        if (membersSharingSameShift <= concurrentLeave) {
          // Enough slots per day for all members - each can use all usable days
          baseAllocationPerMember = groupUsableDays;
        } else {
          // More members than slots - divide slots proportionally
          // Formula: usableDays * (concurrentLeave / membersSharingSameShift)
          baseAllocationPerMember = Math.floor((groupUsableDays * concurrentLeave) / membersSharingSameShift);
        }
        
        // Allocate realistic days to each member based on their remaining balance
        for (const memberAnalytic of groupMembers) {
          if (memberAnalytic.analytics.remainingLeaveBalance > 0) {
            // Cap by remaining leave balance
            // If baseAllocationPerMember is 0 but member has balance > 0 and there are usable days,
            // ensure they get at least 1 day (if their balance allows)
            let realisticDays = Math.min(
              baseAllocationPerMember,
              memberAnalytic.analytics.remainingLeaveBalance
            );
            
            // If the calculation resulted in 0 but member has balance > 0 and there are usable days,
            // give them at least 1 day (if their balance allows)
            if (realisticDays === 0 && groupUsableDays > 0 && memberAnalytic.analytics.remainingLeaveBalance > 0) {
              realisticDays = Math.min(1, memberAnalytic.analytics.remainingLeaveBalance);
            }
            
            memberAnalytic.analytics.realisticUsableDays = realisticDays;
          } else {
            // Members with zero balance get zero realistic days
            memberAnalytic.analytics.realisticUsableDays = 0;
          }
        }
      } else {
        // All members have zero balance - set realistic days to 0
        for (const memberAnalytic of groupMembers) {
          memberAnalytic.analytics.realisticUsableDays = 0;
        }
      }
    }
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
        groupAverageRealisticUsableDays: (() => {
          // Only count members with realisticUsableDays > 0 in average calculation
          // This gives a more accurate average of what members can actually use
          const membersWithRealisticDays = groupMembers.filter(m => m.analytics.realisticUsableDays > 0);
          if (membersWithRealisticDays.length === 0) return 0;
          return Math.floor(groupTotalRealisticUsableDays / membersWithRealisticDays.length);
        })(),
        groupTotalUsableDays,
        groupTotalRealisticUsableDays,
        groupTotalRemainderDays,
        groupAverageLeaveBalance: groupTotalMembers > 0
          ? Math.round(groupTotalLeaveBalance / groupTotalMembers)
          : 0,
        groupTotalLeaveBalance,
        groupAverageUsableDays: groupTotalMembers > 0
          ? Math.round((groupMembers.reduce((sum, m) => sum + m.analytics.usableDays, 0) / groupTotalMembers) * 10) / 10
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

// Leave frequency data interface
export interface LeaveFrequencyData {
  period: string; // Display name (e.g., "January 2025" or "Week 1, 2025")
  periodKey: string; // Unique key for sorting (e.g., "2025-01" or "2025-W01")
  workingDaysUsed: number; // Total working days used in this period
  requestCount: number; // Number of leave requests in this period
}

// Calculate leave frequency by period (month or week)
export const calculateLeaveFrequencyByPeriod = (
  approvedRequests: LeaveRequest[],
  members: User[],
  periodType: 'month' | 'week' = 'month',
  year?: number
): LeaveFrequencyData[] => {
  // Filter out maternity leave requests
  const regularRequests = approvedRequests.filter(req => 
    !req.reason || !isMaternityLeave(req.reason)
  );

  debug(`[Leave Frequency] Processing ${regularRequests.length} regular requests with ${members.length} members`);

  // Create a map to aggregate data by period
  const frequencyMap = new Map<string, { workingDaysUsed: number; requestCount: number }>();

  let requestsWithMembers = 0;
  let requestsWithoutMembers = 0;

  // If year is specified, set year boundaries
  let yearStart: Date | null = null;
  let yearEnd: Date | null = null;
  if (year !== undefined) {
    yearStart = new Date(year, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    yearEnd = new Date(year, 11, 31);
    yearEnd.setHours(23, 59, 59, 999);
  }

  // Process each request
  for (const request of regularRequests) {
    let startDate = parseDateSafe(request.startDate);
    let endDate = parseDateSafe(request.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // If year is specified, clip the request period to the year boundaries
    if (year !== undefined && yearStart && yearEnd) {
      // Only process if request overlaps with the selected year
      if (startDate > yearEnd || endDate < yearStart) {
        continue; // Request doesn't overlap with selected year
      }
      // Clip to year boundaries
      if (startDate < yearStart) {
        startDate = new Date(yearStart);
      }
      if (endDate > yearEnd) {
        endDate = new Date(yearEnd);
      }
    }

    // Find the member for this request
    const member = members.find(m => {
      const memberId = m._id ? String(m._id) : '';
      const requestUserId = request.userId ? String(request.userId) : '';
      return memberId === requestUserId;
    });

    if (!member) {
      requestsWithoutMembers++;
      debug(`[Leave Frequency] Request ${request._id} has no matching member. userId: ${request.userId}`);
      continue;
    }
    
    requestsWithMembers++;

    // Get all dates in the request period (already clipped to year if specified)
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      let periodKey: string;

      if (periodType === 'month') {
        // Group by month
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      } else {
        // Group by week
        const year = currentDate.getFullYear();
        const week = getWeekNumber(currentDate);
        periodKey = `${year}-W${String(week).padStart(2, '0')}`;
      }

      // Check if this is a working day for the member
      if (isWorkingDay(currentDate, member)) {
        if (!frequencyMap.has(periodKey)) {
          frequencyMap.set(periodKey, { workingDaysUsed: 0, requestCount: 0 });
        }
        const periodData = frequencyMap.get(periodKey)!;
        periodData.workingDaysUsed += 1;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count requests per period (each request is counted once per period it spans)
    // Use the already clipped startDate and endDate (which respect year boundaries if specified)
    const requestPeriods = new Set<string>();
    const requestDate = new Date(startDate);
    while (requestDate <= endDate) {
      let periodKey: string;
      if (periodType === 'month') {
        const dateYear = requestDate.getFullYear();
        const month = requestDate.getMonth();
        periodKey = `${dateYear}-${String(month + 1).padStart(2, '0')}`;
      } else {
        const dateYear = requestDate.getFullYear();
        const week = getWeekNumber(requestDate);
        periodKey = `${dateYear}-W${String(week).padStart(2, '0')}`;
      }
      requestPeriods.add(periodKey);
      requestDate.setDate(requestDate.getDate() + 1);
    }

    // Increment request count for each period this request spans
    requestPeriods.forEach(periodKey => {
      if (!frequencyMap.has(periodKey)) {
        frequencyMap.set(periodKey, { workingDaysUsed: 0, requestCount: 0 });
      }
      frequencyMap.get(periodKey)!.requestCount += 1;
    });
  }

  debug(`[Leave Frequency] Requests with members: ${requestsWithMembers}, without members: ${requestsWithoutMembers}`);
  debug(`[Leave Frequency] Frequency map size: ${frequencyMap.size}`);

  // Convert map to array and sort by period key
  const frequencyData: LeaveFrequencyData[] = Array.from(frequencyMap.entries())
    .map(([periodKey, data]) => {
      // Get period display name from the first request in that period
      let period: string;
      let periodYear: number;
      if (periodType === 'month') {
        const [year, month] = periodKey.split('-');
        periodYear = parseInt(year);
        const date = new Date(periodYear, parseInt(month) - 1, 1);
        period = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else {
        const [year, weekStr] = periodKey.split('-W');
        periodYear = parseInt(year);
        const week = parseInt(weekStr);
        // Calculate week start date
        const jan1 = new Date(periodYear, 0, 1);
        const daysOffset = (week - 1) * 7;
        const weekStart = new Date(jan1);
        weekStart.setDate(jan1.getDate() + daysOffset - jan1.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        period = `Week ${week}, ${periodYear} (${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
      }
      return {
        period,
        periodKey,
        workingDaysUsed: data.workingDaysUsed,
        requestCount: data.requestCount,
        periodYear
      };
    })
    .filter(item => {
      // If year is specified, only include periods from that year
      if (year !== undefined) {
        return item.periodYear === year;
      }
      return true;
    })
    .map(({ periodYear: _periodYear, ...item }) => {
      // periodYear is used in filter above, then removed from final result
      void _periodYear; // Suppress unused variable warning
      return item;
    })
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  return frequencyData;
};

// Helper function to get week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}


