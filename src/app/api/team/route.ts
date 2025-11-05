import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }
    
    // Fetch team, members, and currentUser in parallel
    const [team, members, currentUser] = await Promise.all([
      TeamModel.findById(user.teamId),
      UserModel.findByTeamId(user.teamId),
      UserModel.findById(user.id),
    ]);

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Use members as-is, no need to add current user separately
    const allMembers = members;

    // Build response - include manualLeaveBalance only for leaders
    const isLeader = user.role === 'leader';
    
    const response = {
      team,
      currentUser: currentUser ? {
        _id: currentUser._id,
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role,
        shiftSchedule: currentUser.shiftSchedule,
        shiftTag: currentUser.shiftTag,
        workingDaysTag: currentUser.workingDaysTag,
        subgroupTag: currentUser.subgroupTag,
        // Include manualLeaveBalance for current user (they can see their own)
        manualLeaveBalance: currentUser.manualLeaveBalance,
        manualYearToDateUsed: currentUser.manualYearToDateUsed,
        manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
        manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
      } : null,
      members: allMembers.map(member => {
        const baseMember = {
          _id: member._id,
          username: member.username,
          fullName: member.fullName,
          role: member.role,
          shiftSchedule: member.shiftSchedule,
          shiftTag: member.shiftTag,
          workingDaysTag: member.workingDaysTag,
          subgroupTag: member.subgroupTag,
          createdAt: member.createdAt,
        };
        
        // Include manualLeaveBalance and manualYearToDateUsed for leaders (to edit balances) or if it's the current user's own data
        if (isLeader || member._id === user.id) {
          return {
            ...baseMember,
            manualLeaveBalance: member.manualLeaveBalance,
            manualYearToDateUsed: member.manualYearToDateUsed,
            manualMaternityLeaveBalance: member.manualMaternityLeaveBalance,
            manualMaternityYearToDateUsed: member.manualMaternityYearToDateUsed,
          };
        }
        
        return baseMember;
      }),
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Get team error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let { settings } = await request.json();
    
    if (!settings || 
        typeof settings.concurrentLeave !== 'number' || 
        typeof settings.maxLeavePerYear !== 'number' ||
        typeof settings.minimumNoticePeriod !== 'number') {
      return NextResponse.json(
        { error: 'Invalid settings' },
        { status: 400 }
      );
    }

    // allowCarryover is optional boolean, ensure it's set if provided
    if (settings.allowCarryover !== undefined && typeof settings.allowCarryover !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid settings' },
        { status: 400 }
      );
    }

    // enableSubgrouping is optional boolean, ensure it's set if provided
    if (settings.enableSubgrouping !== undefined && typeof settings.enableSubgrouping !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid settings' },
        { status: 400 }
      );
    }

    // Validate workingDaysGroupNames if provided
    if (settings.workingDaysGroupNames !== undefined) {
      if (typeof settings.workingDaysGroupNames !== 'object' || Array.isArray(settings.workingDaysGroupNames) || settings.workingDaysGroupNames === null) {
        return NextResponse.json(
          { error: 'workingDaysGroupNames must be an object' },
          { status: 400 }
        );
      }
      
      // Validate all values are strings
      for (const [key, value] of Object.entries(settings.workingDaysGroupNames)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          return NextResponse.json(
            { error: 'workingDaysGroupNames must have string keys and string values' },
            { status: 400 }
          );
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
        return NextResponse.json(
          { error: 'bypassNoticePeriod must be an object' },
          { status: 400 }
        );
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
          return NextResponse.json(
            { error: 'Both start date and end date are required when bypass notice period is enabled' },
            { status: 400 }
          );
        }
        
        // Convert string dates to Date objects
        const startDate = new Date(settings.bypassNoticePeriod.startDate);
        const endDate = new Date(settings.bypassNoticePeriod.endDate);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for bypass notice period' },
            { status: 400 }
          );
        }
        
        if (endDate < startDate) {
          return NextResponse.json(
            { error: 'End date must be on or after start date' },
            { status: 400 }
          );
        }
        
        // Store dates as Date objects
        settings.bypassNoticePeriod.startDate = startDate;
        settings.bypassNoticePeriod.endDate = endDate;
      }
    }

    // Validate maternity leave settings if provided
    if (settings.maternityLeave !== undefined) {
      if (typeof settings.maternityLeave !== 'object' || Array.isArray(settings.maternityLeave) || settings.maternityLeave === null) {
        return NextResponse.json(
          { error: 'maternityLeave must be an object' },
          { status: 400 }
        );
      }
      
      // Validate maxDays if provided
      if (settings.maternityLeave.maxDays !== undefined) {
        if (typeof settings.maternityLeave.maxDays !== 'number' || !Number.isInteger(settings.maternityLeave.maxDays)) {
          return NextResponse.json(
            { error: 'maternityLeave.maxDays must be an integer' },
            { status: 400 }
          );
        }
        if (settings.maternityLeave.maxDays < 1 || settings.maternityLeave.maxDays > 365) {
          return NextResponse.json(
            { error: 'maternityLeave.maxDays must be between 1 and 365' },
            { status: 400 }
          );
        }
      }
      
      // Validate countingMethod if provided
      if (settings.maternityLeave.countingMethod !== undefined) {
        if (settings.maternityLeave.countingMethod !== 'calendar' && settings.maternityLeave.countingMethod !== 'working') {
          return NextResponse.json(
            { error: 'maternityLeave.countingMethod must be either "calendar" or "working"' },
            { status: 400 }
          );
        }
      }
    }

    // If subgrouping is enabled, validate subgroups
    if (settings.enableSubgrouping) {
      // Validate subgroups is an array
      if (settings.subgroups === undefined) {
        settings.subgroups = [];
      }
      if (!Array.isArray(settings.subgroups)) {
        return NextResponse.json(
          { error: 'Subgroups must be an array' },
          { status: 400 }
        );
      }
      
      // Filter out empty subgroup names
      const validSubgroups = settings.subgroups.filter((name: string) => name && name.trim().length > 0);
      
      // Require at least 2 subgroups (one subgroup is just the team itself)
      if (validSubgroups.length < 2) {
        return NextResponse.json(
          { error: 'At least 2 subgroups are required when subgrouping is enabled' },
          { status: 400 }
        );
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
    
    // Verify the update by fetching the updated team
    const updatedTeam = await TeamModel.findById(user.teamId);
    if (!updatedTeam) {
      return NextResponse.json({ error: 'Team not found after update' }, { status: 500 });
    }
    
    console.log('[Team API] Settings updated successfully:', {
      concurrentLeave: updatedTeam.settings.concurrentLeave,
      maxLeavePerYear: updatedTeam.settings.maxLeavePerYear,
      minimumNoticePeriod: updatedTeam.settings.minimumNoticePeriod
    });
    
    return NextResponse.json({ 
      success: true,
      settings: updatedTeam.settings // Return updated settings for verification
    });
  } catch (error) {
    console.error('Update team settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
