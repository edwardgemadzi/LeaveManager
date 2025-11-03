import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { getMemberAnalytics, getTeamAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';

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

    // Fetch team data
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
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
      
      return NextResponse.json({ analytics });
    } else if (user.role === 'leader') {
      // Return grouped team analytics for leaders
      const members = await UserModel.findByTeamId(user.teamId);
      
      console.log('Analytics API - Members found:', members.length);
      console.log('Analytics API - All requests:', allRequests.length);
      
      try {
        const groupedAnalytics = getGroupedTeamAnalytics(members, team, allRequests);
        console.log('Analytics API - Grouped analytics generated:', {
          hasAggregate: !!groupedAnalytics.aggregate,
          hasGroups: !!groupedAnalytics.groups,
          groupsLength: groupedAnalytics.groups?.length || 0
        });
        
        // Return both grouped and regular analytics for backward compatibility
        const regularAnalytics = getTeamAnalytics(members, team, allRequests);
        
        return NextResponse.json({ 
          analytics: groupedAnalytics,
          regularAnalytics // Keep for backward compatibility
        });
      } catch (calcError) {
        console.error('Analytics API - Error calculating analytics:', calcError);
        throw calcError;
      }
    } else {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
  } catch (error) {
    console.error('Analytics API error:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

