import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { getMemberAnalytics, getTeamAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { error as logError, debug } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

// Disable caching for this API route to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    // Fetch team data - ensure we get fresh data (no caching)
    // IMPORTANT: This team object is passed to all calculation functions (getMemberAnalytics, getTeamAnalytics, getGroupedTeamAnalytics)
    // to ensure concurrent leave settings are consistently applied throughout the calculation chain
    // 
    // Note: MongoDB findById should return fresh data, but we fetch it explicitly here to ensure
    // we have the latest settings after any updates (e.g., concurrent leave changes)
    // 
    // If the analytics API is called immediately after a settings update, there might be a brief
    // delay before MongoDB has the updated data. We fetch the team data directly here to ensure
    // we get the most recent settings.
    // 
    // CRITICAL: We fetch the team data fresh on every request to ensure we have the latest concurrent leave setting
    const team = await TeamModel.findById(user.teamId);
    
    // If team is not found, return error
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    
    // CRITICAL: Verify we have the correct concurrent leave value
    // Log the exact value being used for calculations
    debug('[Analytics API] CRITICAL - Team fetched for calculations:', {
      teamId: team._id,
      concurrentLeave: team.settings?.concurrentLeave,
      concurrentLeaveType: typeof team.settings?.concurrentLeave,
      timestamp: new Date().toISOString()
    });
    
    // Verify team.settings exists and has concurrentLeave - DO NOT override actual values
    // This validation ensures all calculation functions receive a valid team object with concurrent leave settings
    if (!team.settings) {
      logError('[Analytics API] ERROR: team.settings is missing! Team object:', {
        _id: team._id,
        name: team.name,
        hasSettings: false
      });
      return internalServerError('Team settings not found');
    }
    
    if (typeof team.settings.concurrentLeave !== 'number' || team.settings.concurrentLeave < 1) {
      logError('[Analytics API] ERROR: team.settings.concurrentLeave is invalid!', {
        value: team.settings.concurrentLeave,
        type: typeof team.settings.concurrentLeave,
        settings: team.settings
      });
      return internalServerError('Invalid concurrent leave setting');
    }
    

    // Fetch user data
    const currentUser = await UserModel.findById(user.id);
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all leave requests for the team
    const allRequests = await LeaveRequestModel.findByTeamId(user.teamId);
    
    // Get all approved requests (needed for realistic calculations)
    const allApprovedRequests = allRequests.filter(req => req.status === 'approved');

    // Return analytics based on role
    if (user.role === 'member') {
      // Return member's own analytics
      // Filter to only approved requests (matching leave balance page logic)
      const memberRequests = allRequests.filter(req => 
        req.userId === user.id && req.status === 'approved'
      );
      const members = await UserModel.findByTeamId(user.teamId);
      
      // Ensure we only pass members (not leaders) - findByTeamId should already filter this
      // but double-check to be safe and ensure no duplicates or incorrect entries
      const memberList = members.filter(m => m.role === 'member');
      
      const analytics = getMemberAnalytics(
        currentUser,
        team,
        memberRequests,
        allApprovedRequests,
        memberList
      );
      
      return NextResponse.json({ analytics }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } else if (user.role === 'leader') {
      // Return grouped team analytics for leaders
      const members = await UserModel.findByTeamId(user.teamId);
      
      debug('Analytics API - Members found:', members.length);
      debug('Analytics API - All requests:', allRequests.length);
      
      try {
        debug('[Analytics API] Before calculation - team.settings.concurrentLeave:', team.settings.concurrentLeave);
        debug('[Analytics API] Team object structure:', {
          _id: team._id,
          hasSettings: !!team.settings,
          concurrentLeave: team.settings.concurrentLeave,
          concurrentLeaveType: typeof team.settings.concurrentLeave,
          settingsKeys: team.settings ? Object.keys(team.settings) : []
        });
        
        const groupedAnalytics = getGroupedTeamAnalytics(members, team, allRequests);
        
        debug('[Analytics API] After calculation - Sample usable days:', groupedAnalytics.groups?.[0]?.members?.[0]?.analytics?.usableDays);
        debug('[Analytics API] After calculation - Total usable days:', groupedAnalytics.aggregate?.totalUsableDays);
        debug('[Analytics API] After calculation - Total realistic usable days:', groupedAnalytics.aggregate?.totalRealisticUsableDays);
        debug('Analytics API - Grouped analytics generated:', {
          hasAggregate: !!groupedAnalytics.aggregate,
          hasGroups: !!groupedAnalytics.groups,
          groupsLength: groupedAnalytics.groups?.length || 0
        });
        
        // Return both grouped and regular analytics for backward compatibility
        const regularAnalytics = getTeamAnalytics(members, team, allRequests);
        
        debug('[Analytics API] Returning analytics with concurrentLeave:', team.settings.concurrentLeave);
        
        return NextResponse.json({ 
          analytics: groupedAnalytics,
          regularAnalytics // Keep for backward compatibility
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      } catch (calcError) {
        logError('Analytics API - Error calculating analytics:', calcError);
        throw calcError;
      }
    } else {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
  } catch (error) {
    logError('Analytics API error:', error);
    return internalServerError();
  }
}

