import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { apiRateLimit } from '@/lib/rateLimit';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { invalidateAnalyticsCache } from '@/lib/analyticsCache';
import { error as logError, info } from '@/lib/logger';
import { internalServerError, unauthorizedError, forbiddenError, badRequestError, notFoundError } from '@/lib/errors';
import { TeamPolicyVersionModel } from '@/models/TeamPolicyVersion';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user) {
      return unauthorizedError('Invalid token');
    }

    if (!user.teamId) {
      return badRequestError('No team assigned');
    }
    
    const membersMode = searchParams.get('members') || 'full'; // full | summary | none
    const includeMembers = membersMode !== 'none';
    const includeCurrentUser = searchParams.get('currentUser') !== 'none';

    // Fetch team, members, and currentUser in parallel (skip when not needed)
    const [team, members, currentUser] = await Promise.all([
      TeamModel.findById(user.teamId),
      includeMembers ? UserModel.findByTeamId(user.teamId) : Promise.resolve([]),
      includeCurrentUser ? UserModel.findById(user.id) : Promise.resolve(null),
    ]);

    if (!team) {
      return notFoundError('Team not found');
    }

    // Use members as-is, no need to add current user separately
    const allMembers = members;

    // Build response - include manualLeaveBalance only for leaders
    const isLeader = user.role === 'leader';
    
    const response = {
      team,
      ...(includeCurrentUser ? {
        currentUser: currentUser ? {
          _id: currentUser._id,
          username: currentUser.username,
          fullName: currentUser.fullName,
          role: currentUser.role,
          shiftSchedule: currentUser.shiftSchedule,
          shiftHistory: currentUser.shiftHistory, // Include shift history for historical schedule support
          shiftTag: currentUser.shiftTag,
          workingDaysTag: currentUser.workingDaysTag,
          subgroupTag: currentUser.subgroupTag,
          maternityPaternityType: currentUser.maternityPaternityType,
          // Include manualLeaveBalance for current user (they can see their own)
          manualLeaveBalance: currentUser.manualLeaveBalance,
          manualYearToDateUsed: currentUser.manualYearToDateUsed,
          manualYearToDateUsedYear: currentUser.manualYearToDateUsedYear,
          manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
          manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
          carryoverFromPreviousYear: currentUser.carryoverFromPreviousYear,
          carryoverExpiryDate: currentUser.carryoverExpiryDate,
        } : null,
      } : {}),
      ...(includeMembers ? {
        members: allMembers.map(member => {
          const baseMember = {
            _id: member._id,
            username: member.username,
            fullName: member.fullName,
            role: member.role,
            shiftSchedule: member.shiftSchedule,
            shiftHistory: membersMode === 'full' ? member.shiftHistory : undefined,
            shiftTag: member.shiftTag,
            workingDaysTag: member.workingDaysTag,
            subgroupTag: member.subgroupTag,
            maternityPaternityType: member.maternityPaternityType,
            createdAt: member.createdAt,
          };
          
          // Include manualLeaveBalance and manualYearToDateUsed for leaders (to edit balances) or if it's the current user's own data
          if (membersMode === 'full' && (isLeader || member._id === user.id)) {
            return {
              ...baseMember,
              manualLeaveBalance: member.manualLeaveBalance,
              manualYearToDateUsed: member.manualYearToDateUsed,
              manualYearToDateUsedYear: member.manualYearToDateUsedYear,
              manualMaternityLeaveBalance: member.manualMaternityLeaveBalance,
              manualMaternityYearToDateUsed: member.manualMaternityYearToDateUsed,
              carryoverFromPreviousYear: member.carryoverFromPreviousYear,
              carryoverExpiryDate: member.carryoverExpiryDate,
            };
          }
          
          return baseMember;
        }),
      } : {}),
    };
    
    return NextResponse.json(response);
  } catch (error) {
    logError('Get team error:', error);
    return internalServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (shouldRejectCsrf(request)) {
      return forbiddenError('Invalid request origin');
    }

    // Apply rate limiting
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return forbiddenError();
    }

    let { settings } = await request.json();
    
    if (!settings || 
        typeof settings.concurrentLeave !== 'number' || 
        typeof settings.maxLeavePerYear !== 'number' ||
        typeof settings.minimumNoticePeriod !== 'number') {
      return badRequestError('Invalid settings');
    }

    // allowCarryover is optional boolean, ensure it's set if provided
    if (settings.allowCarryover !== undefined && typeof settings.allowCarryover !== 'boolean') {
      return badRequestError('Invalid settings');
    }

    // Validate carryover settings if provided
    if (settings.carryoverSettings !== undefined) {
      if (typeof settings.carryoverSettings !== 'object' || Array.isArray(settings.carryoverSettings) || settings.carryoverSettings === null) {
        return badRequestError('carryoverSettings must be an object');
      }
      
      // Validate limitedToMonths if provided
      if (settings.carryoverSettings.limitedToMonths !== undefined) {
        if (!Array.isArray(settings.carryoverSettings.limitedToMonths)) {
          return badRequestError('limitedToMonths must be an array');
        }
        // Validate all values are numbers between 0-11
        for (const month of settings.carryoverSettings.limitedToMonths) {
          if (typeof month !== 'number' || month < 0 || month > 11) {
            return badRequestError('limitedToMonths must contain numbers between 0-11');
          }
        }
        // Remove duplicates and sort
        const monthsArray = settings.carryoverSettings.limitedToMonths as number[];
        settings.carryoverSettings.limitedToMonths = [...new Set(monthsArray)].sort((a, b) => a - b);
      }
      
      // Validate maxCarryoverDays if provided
      if (settings.carryoverSettings.maxCarryoverDays !== undefined) {
        if (typeof settings.carryoverSettings.maxCarryoverDays !== 'number' || settings.carryoverSettings.maxCarryoverDays < 0) {
          return badRequestError('maxCarryoverDays must be a non-negative number');
        }
      }
      
      // Validate expiryDate if provided
      if (settings.carryoverSettings.expiryDate !== undefined && settings.carryoverSettings.expiryDate !== null) {
        const expiryDate = new Date(settings.carryoverSettings.expiryDate);
        if (isNaN(expiryDate.getTime())) {
          return badRequestError('Invalid date format for carryover expiry date');
        }
        // Store as Date object
        settings.carryoverSettings.expiryDate = expiryDate;
      } else if (settings.carryoverSettings.expiryDate === null) {
        settings.carryoverSettings.expiryDate = undefined;
      }
    }

    // enableSubgrouping is optional boolean, ensure it's set if provided
    if (settings.enableSubgrouping !== undefined && typeof settings.enableSubgrouping !== 'boolean') {
      return badRequestError('Invalid settings');
    }

    // Validate workingDaysGroupNames if provided
    if (settings.workingDaysGroupNames !== undefined) {
      if (typeof settings.workingDaysGroupNames !== 'object' || Array.isArray(settings.workingDaysGroupNames) || settings.workingDaysGroupNames === null) {
        return badRequestError('workingDaysGroupNames must be an object');
      }
      
      // Validate all values are strings
      for (const [key, value] of Object.entries(settings.workingDaysGroupNames)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          return badRequestError('workingDaysGroupNames must have string keys and string values');
        }
        // Trim empty values and remove them
        if (!value.trim()) {
          delete settings.workingDaysGroupNames[key];
        } else {
          settings.workingDaysGroupNames[key] = value.trim();
        }
      }
    }

    // Validate bypass notice period if provided
    if (settings.bypassNoticePeriod !== undefined) {
      if (typeof settings.bypassNoticePeriod !== 'object' || Array.isArray(settings.bypassNoticePeriod) || settings.bypassNoticePeriod === null) {
        return badRequestError('bypassNoticePeriod must be an object');
      }
      
      // If enabled is false, clear dates
      if (settings.bypassNoticePeriod.enabled === false) {
        settings.bypassNoticePeriod = {
          enabled: false,
          startDate: undefined,
          endDate: undefined,
        };
      } else if (settings.bypassNoticePeriod.enabled === true) {
        // If enabled, validate dates are provided and valid
        if (!settings.bypassNoticePeriod.startDate || !settings.bypassNoticePeriod.endDate) {
          return badRequestError('Both start date and end date are required when bypass notice period is enabled');
        }
        
        // Convert string dates to Date objects
        const startDate = new Date(settings.bypassNoticePeriod.startDate);
        const endDate = new Date(settings.bypassNoticePeriod.endDate);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return badRequestError('Invalid date format for bypass notice period');
        }
        
        if (endDate < startDate) {
          return badRequestError('End date must be on or after start date');
        }
        
        // Store dates as Date objects
        settings.bypassNoticePeriod.startDate = startDate;
        settings.bypassNoticePeriod.endDate = endDate;
      }
    }

    // Validate maternity leave settings if provided
    if (settings.maternityLeave !== undefined) {
      if (typeof settings.maternityLeave !== 'object' || Array.isArray(settings.maternityLeave) || settings.maternityLeave === null) {
        return badRequestError('maternityLeave must be an object');
      }
      
      // Validate enabled field if provided
      if (settings.maternityLeave.enabled !== undefined) {
        if (typeof settings.maternityLeave.enabled !== 'boolean') {
          return badRequestError('maternityLeave.enabled must be a boolean');
        }
      }
      
      // Validate maxDays if provided
      if (settings.maternityLeave.maxDays !== undefined) {
        if (typeof settings.maternityLeave.maxDays !== 'number' || !Number.isInteger(settings.maternityLeave.maxDays)) {
          return badRequestError('maternityLeave.maxDays must be an integer');
        }
        if (settings.maternityLeave.maxDays < 1 || settings.maternityLeave.maxDays > 365) {
          return badRequestError('maternityLeave.maxDays must be between 1 and 365');
        }
      }
      
      // Validate countingMethod if provided
      if (settings.maternityLeave.countingMethod !== undefined) {
        if (settings.maternityLeave.countingMethod !== 'calendar' && settings.maternityLeave.countingMethod !== 'working') {
          return badRequestError('maternityLeave.countingMethod must be either "calendar" or "working"');
        }
      }
    }

    // Validate paternity leave settings if provided
    if (settings.paternityLeave !== undefined) {
      if (typeof settings.paternityLeave !== 'object' || Array.isArray(settings.paternityLeave) || settings.paternityLeave === null) {
        return badRequestError('paternityLeave must be an object');
      }
      
      // Validate enabled field if provided
      if (settings.paternityLeave.enabled !== undefined) {
        if (typeof settings.paternityLeave.enabled !== 'boolean') {
          return badRequestError('paternityLeave.enabled must be a boolean');
        }
      }
      
      // Validate maxDays if provided
      if (settings.paternityLeave.maxDays !== undefined) {
        if (typeof settings.paternityLeave.maxDays !== 'number' || !Number.isInteger(settings.paternityLeave.maxDays)) {
          return badRequestError('paternityLeave.maxDays must be an integer');
        }
        if (settings.paternityLeave.maxDays < 1 || settings.paternityLeave.maxDays > 365) {
          return badRequestError('paternityLeave.maxDays must be between 1 and 365');
        }
      }
      
      // Validate countingMethod if provided
      if (settings.paternityLeave.countingMethod !== undefined) {
        if (settings.paternityLeave.countingMethod !== 'calendar' && settings.paternityLeave.countingMethod !== 'working') {
          return badRequestError('paternityLeave.countingMethod must be either "calendar" or "working"');
        }
      }
    }

    if (
      settings.allowMemberHistoricalSubmissions !== undefined &&
      typeof settings.allowMemberHistoricalSubmissions !== 'boolean'
    ) {
      return badRequestError('allowMemberHistoricalSubmissions must be a boolean');
    }

    if (settings.historicalSubmissionLookbackDays !== undefined) {
      if (
        typeof settings.historicalSubmissionLookbackDays !== 'number' ||
        !Number.isInteger(settings.historicalSubmissionLookbackDays)
      ) {
        return badRequestError('historicalSubmissionLookbackDays must be an integer');
      }
      if (
        settings.historicalSubmissionLookbackDays < 30 ||
        settings.historicalSubmissionLookbackDays > 3650
      ) {
        return badRequestError('historicalSubmissionLookbackDays must be between 30 and 3650');
      }
    }

    if (settings.enforceHolidayBlocking !== undefined && typeof settings.enforceHolidayBlocking !== 'boolean') {
      return badRequestError('enforceHolidayBlocking must be a boolean');
    }

    if (settings.holidays !== undefined) {
      if (!Array.isArray(settings.holidays)) {
        return badRequestError('holidays must be an array');
      }
      settings.holidays = settings.holidays.map((holiday: { id?: string; name?: string; date?: string; countryCode?: string }) => {
        if (!holiday?.name || !holiday?.date) {
          throw new Error('Invalid holiday');
        }
        const parsed = new Date(holiday.date);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Invalid holiday date');
        }
        return {
          id: holiday.id || `${holiday.name}-${holiday.date}`,
          name: holiday.name.trim(),
          date: parsed.toISOString().split('T')[0],
          countryCode: holiday.countryCode?.trim() || undefined,
        };
      });
    }

    if (settings.blackoutDates !== undefined) {
      if (!Array.isArray(settings.blackoutDates)) {
        return badRequestError('blackoutDates must be an array');
      }
      settings.blackoutDates = settings.blackoutDates.map(
        (item: { id?: string; name?: string; startDate?: string; endDate?: string; reason?: string }) => {
          if (!item?.name || !item?.startDate || !item?.endDate) {
            throw new Error('Invalid blackout date');
          }
          const startDate = new Date(item.startDate);
          const endDate = new Date(item.endDate);
          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
            throw new Error('Invalid blackout date range');
          }
          return {
            id: item.id || `${item.name}-${item.startDate}-${item.endDate}`,
            name: item.name.trim(),
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            reason: item.reason?.trim() || undefined,
          };
        }
      );
    }

    if (settings.delegatedApprovers !== undefined) {
      if (!Array.isArray(settings.delegatedApprovers)) {
        return badRequestError('delegatedApprovers must be an array');
      }
      settings.delegatedApprovers = settings.delegatedApprovers.map((entry: {
        userId?: string;
        username?: string;
        startsAt?: string | Date;
        endsAt?: string | Date;
        scope?: 'all' | 'team' | 'member';
        memberIds?: string[];
      }) => {
        if (!entry.userId || !entry.startsAt || !entry.endsAt) {
          throw new Error('Invalid delegated approver entry');
        }
        const startsAt = new Date(entry.startsAt);
        const endsAt = new Date(entry.endsAt);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
          throw new Error('Invalid delegated approver window');
        }
        return {
          userId: entry.userId,
          username: entry.username,
          startsAt,
          endsAt,
          scope: entry.scope || 'team',
          memberIds: Array.isArray(entry.memberIds) ? entry.memberIds : undefined,
          createdAt: new Date(),
          createdBy: user.id,
        };
      });
    }

    if (settings.accrual !== undefined) {
      if (typeof settings.accrual !== 'object' || settings.accrual === null || Array.isArray(settings.accrual)) {
        return badRequestError('accrual must be an object');
      }
      const { enabled, cadence, annualEntitlementDays, prorateOnJoin, capDays } = settings.accrual;
      if (typeof enabled !== 'boolean') {
        return badRequestError('accrual.enabled must be a boolean');
      }
      if (!['monthly', 'biweekly', 'yearly'].includes(cadence)) {
        return badRequestError('accrual.cadence must be monthly, biweekly, or yearly');
      }
      if (typeof annualEntitlementDays !== 'number' || annualEntitlementDays <= 0) {
        return badRequestError('accrual.annualEntitlementDays must be greater than 0');
      }
      if (typeof prorateOnJoin !== 'boolean') {
        return badRequestError('accrual.prorateOnJoin must be a boolean');
      }
      if (capDays !== undefined && (typeof capDays !== 'number' || capDays < 0)) {
        return badRequestError('accrual.capDays must be a non-negative number');
      }
    }

    // If subgrouping is enabled, validate subgroups
    if (settings.enableSubgrouping) {
      // Validate subgroups is an array
      if (settings.subgroups === undefined) {
        settings.subgroups = [];
      }
      if (!Array.isArray(settings.subgroups)) {
        return badRequestError('Subgroups must be an array');
      }
      
      // Filter out empty subgroup names
      const validSubgroups = settings.subgroups.filter((name: string) => name && name.trim().length > 0);
      
      // Require at least 2 subgroups (one subgroup is just the team itself)
      if (validSubgroups.length < 2) {
        return badRequestError('At least 2 subgroups are required when subgrouping is enabled');
      }
      
      // Remove duplicates and trim
      const uniqueSubgroups = Array.from(new Set(validSubgroups.map((name: string) => name.trim())));
      settings.subgroups = uniqueSubgroups;
    } else {
      // If subgrouping is disabled, clear subgroups
      settings.subgroups = [];
    }

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    // Get existing team settings to merge workingDaysGroupNames if it's a partial update
    const existingTeam = await TeamModel.findById(user.teamId);
    if (existingTeam) {
      // If workingDaysGroupNames is provided but not a complete replacement, merge with existing
      if (settings.workingDaysGroupNames !== undefined && existingTeam.settings.workingDaysGroupNames) {
        settings.workingDaysGroupNames = {
          ...existingTeam.settings.workingDaysGroupNames,
          ...settings.workingDaysGroupNames,
        };
      }
      // Ensure all other existing settings are preserved
      settings = {
        ...existingTeam.settings,
        ...settings,
      };
    }

    await TeamModel.updateSettings(user.teamId, settings);
    await TeamPolicyVersionModel.create({
      teamId: user.teamId,
      effectiveFrom: new Date(),
      settings,
      createdBy: user.id,
      versionLabel: `Auto ${new Date().toISOString().split('T')[0]}`,
    });
    
    // Verify the update by fetching the updated team
    const updatedTeam = await TeamModel.findById(user.teamId);
    if (!updatedTeam) {
      return internalServerError('Team not found after update');
    }
    
    info('[Team API] Settings updated successfully:', {
      concurrentLeave: updatedTeam.settings.concurrentLeave,
      maxLeavePerYear: updatedTeam.settings.maxLeavePerYear,
      minimumNoticePeriod: updatedTeam.settings.minimumNoticePeriod
    });

    // Broadcast event after settings change
    invalidateAnalyticsCache(user.teamId!);
    broadcastTeamUpdate(user.teamId!, 'settingsUpdated', {
      teamId: user.teamId,
      updatedSettings: updatedTeam.settings,
      updatedBy: user.id,
    });

    return NextResponse.json({ 
      success: true,
      settings: updatedTeam.settings // Return updated settings for verification
    });
  } catch (error) {
    logError('Update team settings error:', error);
    return internalServerError();
  }
}
