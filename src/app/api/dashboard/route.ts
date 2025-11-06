import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { getMemberAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

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
      // Return member's own analytics
      const memberRequests = allRequests.filter(req => 
        req.userId === user.id && req.status === 'approved'
      );
      const memberList = members.filter(m => m.role === 'member');
      const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
      
      analytics = getMemberAnalytics(
        currentUser,
        team,
        memberRequests,
        allApprovedRequests,
        memberList
      );
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
        shiftTag: currentUser.shiftTag,
        workingDaysTag: currentUser.workingDaysTag,
        subgroupTag: currentUser.subgroupTag,
        manualLeaveBalance: currentUser.manualLeaveBalance,
        manualYearToDateUsed: currentUser.manualYearToDateUsed,
        manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
        manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
      } : null,
      members: members.map(member => {
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
      requests: allRequests,
      analytics: user.role === 'leader' ? analytics : { analytics },
    };
    
    return NextResponse.json(response);
  } catch (error) {
    logError('Dashboard API error:', error);
    return internalServerError();
  }
}

