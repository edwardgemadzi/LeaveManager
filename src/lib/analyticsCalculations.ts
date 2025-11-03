import { ShiftSchedule, User, Team, LeaveRequest } from '@/types';
import { countWorkingDays, calculateLeaveBalance, isWorkingDay, getWorkingDays, calculateSurplusBalance } from './leaveCalculations';

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
  const overlappingRequests = allApprovedRequests.filter(req => {
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
  
  // Get user's tags for filtering
  // For rotating schedules, always regenerate (tags change daily)
  // For fixed schedules, use stored tag or generate if missing
  const userWorkingDaysTag = user.shiftSchedule?.type === 'rotating'
    ? generateWorkingDaysTag(user.shiftSchedule)
    : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule));
  const userShiftTag = user.shiftTag;
  const userSubgroupTag = user.subgroupTag;
  
  // Get all remaining working days in the year
  const remainingWorkingDays = getWorkingDays(today, yearEnd, shiftSchedule);
  
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
export const calculateAverageDaysPerMember = (
  usableDays: number,
  membersSharingSameShift: number
): number => {
  if (membersSharingSameShift === 0) {
    return 0;
  }
  
  return Math.round((usableDays / membersSharingSameShift) * 10) / 10;
};

// Calculate carryover vs lost days
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
  realisticUsableDays: number; // Realistic days factoring in members sharing same schedule who also need to use remaining leave days
  remainingLeaveBalance: number; // Remaining balance after subtracting approved requests
  baseLeaveBalance: number; // Base balance (manualLeaveBalance if set, otherwise maxLeavePerYear) - before subtracting approved requests
  workingDaysUsed: number;
  workingDaysInYear: number;
  willCarryover: number;
  willLose: number;
  allowCarryover: boolean;
  membersSharingSameShift: number; // Total members competing for same days
  averageDaysPerMember: number; // Average realistic days per member in same shift
  surplusBalance: number; // Surplus balance when manual balance exceeds team max
}

// Analytics data structure for team
export interface TeamAnalytics {
  aggregate: {
    totalRemainingWorkingDays: number; // Kept for backward compatibility
    totalTheoreticalWorkingDays: number; // Total theoretical working days remaining - NOT adjusted for concurrent leave sharing (raw count)
    totalUsableDays: number; // Total usable days when shared among members - adjusted for concurrent leave limits
    totalRealisticUsableDays: number; // Total realistic usable days factoring in members sharing same schedule
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

  // Calculate theoretical remaining working days in year
  // This is the raw count of working days remaining - NOT adjusted for concurrent leave sharing
  const theoreticalWorkingDays = calculateRemainingWorkingDaysInYear(shiftSchedule);
  
  // Calculate usable days - adjusted for concurrent leave constraints
  // This shows how many days can be used when shared among members who can use them
  const usableDays = calculateUsableDays(
    user,
    team,
    allApprovedRequests,
    filteredMembers, // Use filtered members list
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
  const approvedRequestsForCalculation = approvedRequests
    .filter(req => req.status === 'approved')
    .map(req => ({
      startDate: new Date(req.startDate),
      endDate: new Date(req.endDate)
    }));
  
  // Calculate base balance (manualLeaveBalance if set, otherwise maxLeavePerYear)
  const baseLeaveBalance = user.manualLeaveBalance !== undefined ? user.manualLeaveBalance : team.settings.maxLeavePerYear;
  
  // Debug: Log if approvedRequests is empty but manualLeaveBalance is set
  if (user.manualLeaveBalance !== undefined && approvedRequestsForCalculation.length === 0) {
    console.log(`[DEBUG] User ${user.username}: manualLeaveBalance=${user.manualLeaveBalance}, but no approved requests found`);
  }
  
  const remainingLeaveBalance = calculateLeaveBalance(
    team.settings.maxLeavePerYear,
    approvedRequestsForCalculation,
    shiftSchedule,
    user.manualLeaveBalance
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
  const membersSharingSameShift = calculateMembersSharingSameShift(user, filteredMembers);
  
  // Calculate realistic usable days - factors in members sharing same schedule
  // This divides usable days by members sharing the same shift, capped by remaining leave balance
  const realisticUsableDays = membersSharingSameShift > 0
    ? Math.min(
        Math.round((usableDays / membersSharingSameShift) * 10) / 10,
        remainingLeaveBalance
      )
    : Math.min(usableDays, remainingLeaveBalance);
  
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
    surplusBalance
  };
};

// Get aggregate team analytics
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
  const totalUsableDays = memberAnalytics.reduce((sum, m) => sum + m.analytics.usableDays, 0);
  const totalRealisticUsableDays = memberAnalytics.reduce((sum, m) => sum + m.analytics.realisticUsableDays, 0);
  const memberCount = memberAnalytics.length;
  
  const aggregate = {
    totalRemainingWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0), // Keep for backward compatibility
    totalTheoreticalWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalUsableDays,
    totalRealisticUsableDays,
    totalRemainingLeaveBalance: memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0),
    totalWillCarryover: memberAnalytics.reduce((sum, m) => sum + m.analytics.willCarryover, 0),
    totalWillLose: memberAnalytics.reduce((sum, m) => sum + m.analytics.willLose, 0),
    averageRemainingBalance: memberCount > 0
      ? Math.round(memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0) / memberCount)
      : 0,
    membersCount: memberCount,
    averageDaysPerMemberAcrossTeam: memberCount > 0
      ? Math.round((totalRealisticUsableDays / memberCount) * 10) / 10
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
export const getGroupedTeamAnalytics = (
  members: User[],
  team: Team,
  allRequests: LeaveRequest[]
): GroupedTeamAnalytics => {
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
    const groupTotalUsableDays = groupMembers.reduce((sum, m) => sum + m.analytics.usableDays, 0);
    const groupTotalRealisticUsableDays = groupMembers.reduce((sum, m) => sum + m.analytics.realisticUsableDays, 0);
    const groupTotalLeaveBalance = groupMembers.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0);
    
    return {
      groupKey,
      subgroupTag, // Add subgroupTag to group info
      shiftTag,
      workingDaysTag,
      aggregate: {
        groupTotalMembers,
        groupAverageRealisticUsableDays: groupTotalMembers > 0
          ? Math.round((groupTotalRealisticUsableDays / groupTotalMembers) * 10) / 10
          : 0,
        groupTotalUsableDays,
        groupTotalRealisticUsableDays,
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
  
  // Calculate overall aggregates (same as regular team analytics)
  const totalUsableDays = memberAnalytics.reduce((sum, m) => sum + m.analytics.usableDays, 0);
  const totalRealisticUsableDays = memberAnalytics.reduce((sum, m) => sum + m.analytics.realisticUsableDays, 0);
  const memberCount = memberAnalytics.length;
  
  const aggregate = {
    totalRemainingWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalTheoreticalWorkingDays: memberAnalytics.reduce((sum, m) => sum + m.analytics.theoreticalWorkingDays, 0),
    totalUsableDays,
    totalRealisticUsableDays,
    totalRemainingLeaveBalance: memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0),
    totalWillCarryover: memberAnalytics.reduce((sum, m) => sum + m.analytics.willCarryover, 0),
    totalWillLose: memberAnalytics.reduce((sum, m) => sum + m.analytics.willLose, 0),
    averageRemainingBalance: memberCount > 0
      ? Math.round(memberAnalytics.reduce((sum, m) => sum + m.analytics.remainingLeaveBalance, 0) / memberCount)
      : 0,
    membersCount: memberCount,
    averageDaysPerMemberAcrossTeam: memberCount > 0
      ? Math.round((totalRealisticUsableDays / memberCount) * 10) / 10
      : 0
  };
  
  return {
    aggregate,
    groups
  };
};

