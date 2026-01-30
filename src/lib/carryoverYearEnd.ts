/**
 * Year-end carryover calculation and update functions
 * This ensures carryover is automatically calculated and set correctly at year end
 */

import { getDatabase } from './mongodb';
import { User, LeaveRequest, Team } from '@/types';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { parseDateSafe } from './dateUtils';
import { isMaternityLeave, countWorkingDays } from './leaveCalculations';
import { Filter } from 'mongodb';

/**
 * Calculate carryover for a single user based on their previous year usage
 * @param user - The user to calculate carryover for
 * @param team - The team the user belongs to
 * @param previousYear - The year to calculate carryover from (e.g., 2025)
 * @param allApprovedRequests - All approved leave requests for the team
 * @returns Object with expectedCarryover and expiryDate
 */
export function calculateUserCarryover(
  user: User,
  team: Team,
  previousYear: number,
  allApprovedRequests: LeaveRequest[]
): { expectedCarryover: number; expiryDate: Date | null } {
  const maxLeavePerYear = team.settings.maxLeavePerYear;
  const carryoverSettings = team.settings.carryoverSettings;
  
  // Calculate previous year date range
  const yearStart = new Date(previousYear, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(previousYear, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);
  
  // Get user's approved requests
  const memberRequests = allApprovedRequests.filter(req => 
    String(req.userId).trim() === String(user._id).trim()
  );
  
  // Filter to previous year requests (excluding maternity leave)
  const previousYearRequests = memberRequests.filter(req => {
    const reqStart = parseDateSafe(req.startDate);
    const reqEnd = parseDateSafe(req.endDate);
    return reqStart <= yearEnd && reqEnd >= yearStart;
  }).filter(req => !req.reason || !isMaternityLeave(req.reason));
  
  // Calculate working days used in previous year
  const workingDaysUsed = previousYearRequests.reduce((total, req) => {
    const reqStart = parseDateSafe(req.startDate);
    const reqEnd = parseDateSafe(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    
    if (reqStart <= yearEnd && reqEnd >= yearStart) {
      const overlapStart = reqStart > yearStart ? reqStart : yearStart;
      const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
      
      if (overlapEnd >= overlapStart) {
        return total + countWorkingDays(overlapStart, overlapEnd, user);
      }
    }
    return total;
  }, 0);
  
  // For prior years, rely on calculated usage (manual overrides are not year-specific)
  const daysUsed = workingDaysUsed;
  
  // If carryover is disabled, return zero
  if (!team.settings.allowCarryover) {
    return { expectedCarryover: 0, expiryDate: null };
  }
  
  // Calculate expected carryover
  let expectedCarryover = Math.max(0, maxLeavePerYear - daysUsed);
  
  // Apply max carryover cap if configured
  if (carryoverSettings?.maxCarryoverDays !== undefined && carryoverSettings.maxCarryoverDays >= 0) {
    expectedCarryover = Math.min(expectedCarryover, carryoverSettings.maxCarryoverDays);
  }
  
  // Calculate expiry date if carryover settings have expiry and carryover > 0
  let expiryDate: Date | null = null;
  if (expectedCarryover > 0) {
    if (carryoverSettings?.expiryDate) {
      // Use explicit expiry date from settings
      expiryDate = new Date(carryoverSettings.expiryDate);
    } else if (carryoverSettings?.limitedToMonths && carryoverSettings.limitedToMonths.length > 0) {
      // If limited to months, set expiry to end of last allowed month in NEXT year
      // Carryover from previous year is available in the current/new year
      const nextYear = previousYear + 1; // The year the carryover will be available
      const lastAllowedMonth = Math.max(...carryoverSettings.limitedToMonths);
      expiryDate = new Date(nextYear, lastAllowedMonth + 1, 0); // Last day of last allowed month
      expiryDate.setHours(23, 59, 59, 999);
    }
  }
  
  return { expectedCarryover, expiryDate };
}

/**
 * Update carryover for all members of a team based on previous year usage
 * This should be called at year end (e.g., via a scheduled job)
 * @param teamId - The team ID to update carryover for
 * @param previousYear - The year to calculate carryover from (e.g., 2025)
 * @returns Summary of updates
 */
export async function updateTeamCarryover(
  teamId: string,
  previousYear: number
): Promise<{
  teamName: string;
  totalMembers: number;
  membersUpdated: number;
  membersWithCarryover: number;
  totalCarryoverDays: number;
  errors: Array<{ username: string; error: string }>;
}> {
  const db = await getDatabase();
  const usersCollection = db.collection<User>('users');
  
  // Find team
  const team = await TeamModel.findById(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }
  
  // Get all members
  const members = await UserModel.findByTeamId(teamId);
  if (members.length === 0) {
    return {
      teamName: team.name,
      totalMembers: 0,
      membersUpdated: 0,
      membersWithCarryover: 0,
      totalCarryoverDays: 0,
      errors: []
    };
  }
  
  // Get all leave requests for the team
  const requestsCollection = db.collection<LeaveRequest>('leaveRequests');
  const teamIdStr = String(teamId);
  const allRequests = await requestsCollection.find({
    teamId: teamIdStr,
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }]
  } as unknown as Filter<LeaveRequest>).toArray();
  const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
  
  const errors: Array<{ username: string; error: string }> = [];
  let membersUpdated = 0;
  let membersWithCarryover = 0;
  let totalCarryoverDays = 0;
  
  // Process each member
  for (const member of members) {
    try {
      const { expectedCarryover, expiryDate } = calculateUserCarryover(
        member,
        team,
        previousYear,
        allApprovedRequests
      );
      
      if (!member._id) {
        errors.push({
          username: member.username || 'unknown',
          error: 'User ID is missing'
        });
        continue;
      }
      
      const userId = member._id;
      const filter: Filter<User> = { _id: userId };
      
      // Build update data for carryover
      const updateData: Partial<User> = {
        carryoverFromPreviousYear: expectedCarryover
      };
      
      if (expiryDate) {
        updateData.carryoverExpiryDate = expiryDate;
      }
      
      // Clear year-specific manual overrides so next year uses default maxLeavePerYear
      // manualLeaveBalance and manualYearToDateUsed are year-specific and should be cleared at year-end
      const unsetData: Record<string, ''> = {
        manualLeaveBalance: '',
        manualYearToDateUsed: '',
        manualYearToDateUsedYear: ''
      };
      
      // Only update if carryover changed or if manual overrides need to be cleared
      const currentCarryover = member.carryoverFromPreviousYear ?? 0;
      const hasManualOverrides = member.manualLeaveBalance !== undefined || member.manualYearToDateUsed !== undefined;
      const needsUpdate = currentCarryover !== expectedCarryover || hasManualOverrides;
      
      if (needsUpdate) {
        if (expectedCarryover === 0 && !expiryDate) {
          // Clear expiry date if no carryover
          unsetData.carryoverExpiryDate = '';
          await usersCollection.updateOne(
            filter,
            { 
              $set: updateData,
              $unset: unsetData
            }
          );
        } else {
          await usersCollection.updateOne(
            filter,
            { 
              $set: updateData,
              $unset: unsetData
            }
          );
        }
        
        if (currentCarryover !== expectedCarryover) {
          membersUpdated++;
        }
      }
      
      if (expectedCarryover > 0) {
        membersWithCarryover++;
        totalCarryoverDays += expectedCarryover;
      }
    } catch (error) {
      errors.push({
        username: member.username || 'unknown',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return {
    teamName: team.name,
    totalMembers: members.length,
    membersUpdated,
    membersWithCarryover,
    totalCarryoverDays,
    errors
  };
}

/**
 * Update carryover for all teams at year end
 * This should be called via a scheduled job at the end of each year
 * @param previousYear - The year to calculate carryover from (e.g., 2025)
 * @returns Summary of all updates
 */
export async function updateAllTeamsCarryover(
  previousYear: number
): Promise<{
  totalTeams: number;
  teamsProcessed: number;
  totalMembersUpdated: number;
  errors: Array<{ teamName: string; error: string }>;
}> {
  const db = await getDatabase();
  const teamsCollection = db.collection<Team>('teams');
  const allTeams = await teamsCollection.find({}).toArray();
  
  const errors: Array<{ teamName: string; error: string }> = [];
  let teamsProcessed = 0;
  let totalMembersUpdated = 0;
  
  for (const team of allTeams) {
    try {
      const result = await updateTeamCarryover(String(team._id), previousYear);
      teamsProcessed++;
      totalMembersUpdated += result.membersUpdated;
      
      if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => ({ teamName: team.name, error: e.error })));
      }
    } catch (error) {
      errors.push({
        teamName: team.name || 'unknown',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return {
    totalTeams: allTeams.length,
    teamsProcessed,
    totalMembersUpdated,
    errors
  };
}
