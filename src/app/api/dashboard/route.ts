import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { getMemberAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
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

    // Fetch all data in parallel (single database round trip)
    const [team, members, allRequests] = await Promise.all([
      TeamModel.findById(user.teamId),
      UserModel.findByTeamId(user.teamId),
      LeaveRequestModel.findByTeamId(user.teamId),
    ]);

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get current user data
    const currentUser = await UserModel.findById(user.id);
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate analytics based on role
    let analytics;
    if (user.role === 'member') {
      // IMPORTANT: Use grouped analytics to ensure members see the same normalized values as leaders
      // This ensures consistency between member and leader views
      const memberList = members.filter(m => m.role === 'member');
      
      // Calculate grouped analytics first (this normalizes usableDays and recalculates realisticUsableDays)
      const groupedAnalytics = getGroupedTeamAnalytics(memberList, team, allRequests);
      
      // Find the member's analytics from the grouped result
      let memberAnalytics = null;
      for (const group of groupedAnalytics.groups) {
        const memberInGroup = group.members.find(m => m.userId === user.id);
        if (memberInGroup) {
          memberAnalytics = memberInGroup.analytics;
          break;
        }
      }
      
      // Fallback to individual calculation if member not found in groups (shouldn't happen, but safety)
      if (!memberAnalytics) {
        const memberRequests = allRequests.filter(req => 
          req.userId === user.id && req.status === 'approved'
        );
        const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
        memberAnalytics = getMemberAnalytics(
          currentUser,
          team,
          memberRequests,
          allApprovedRequests,
          memberList
        );
      }
      
      analytics = memberAnalytics;
    } else if (user.role === 'leader') {
      // Return grouped team analytics for leaders
      analytics = getGroupedTeamAnalytics(members, team, allRequests);
    } else {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

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
        shiftHistory: currentUser.shiftHistory, // Include shift history for historical schedule support
        shiftTag: currentUser.shiftTag,
        workingDaysTag: currentUser.workingDaysTag,
        subgroupTag: currentUser.subgroupTag,
        manualLeaveBalance: currentUser.manualLeaveBalance,
        manualYearToDateUsed: currentUser.manualYearToDateUsed,
        manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
        manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
        maternityPaternityType: currentUser.maternityPaternityType,
      } : null,
      members: members.map(member => {
        const baseMember = {
          _id: member._id,
          username: member.username,
          fullName: member.fullName,
          role: member.role,
          shiftSchedule: member.shiftSchedule,
          shiftHistory: member.shiftHistory, // Include shift history for historical schedule support
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
            maternityPaternityType: member.maternityPaternityType,
          };
        }
        
        return baseMember;
      }),
      requests: allRequests,
      analytics: user.role === 'leader' ? analytics : { analytics },
    };
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    logError('Dashboard API error:', error);
    return internalServerError();
  }
}

