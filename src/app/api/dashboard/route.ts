import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { LeaveRequest } from '@/types';
import { getMemberAnalytics, getGroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';

// Disable caching for this API route to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
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

    const include = new Set(
      (searchParams.get('include') || 'team,currentUser,members,requests,analytics')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    );
    const membersMode = searchParams.get('members') || 'full';
    const requestFieldsParam = searchParams.get('requestFields');
    const allowedRequestFields = new Set([
      '_id',
      'userId',
      'teamId',
      'startDate',
      'endDate',
      'reason',
      'status',
      'requestedBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'deletedBy',
    ]);
    const requestFields = requestFieldsParam
      ? requestFieldsParam.split(',').map(field => field.trim()).filter(field => allowedRequestFields.has(field))
      : null;
    const pickRequestFields = (req: LeaveRequest) => {
      if (!requestFields || requestFields.length === 0) return req;
      const picked: Partial<LeaveRequest> = {};
      requestFields.forEach(field => {
        if (field in req) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (picked as any)[field] = (req as any)[field];
        }
      });
      return picked;
    };

    const includeAnalytics = include.has('analytics');
    const includeMembers = include.has('members') || includeAnalytics;
    const includeRequests = include.has('requests') || includeAnalytics;
    const includeCurrentUser = include.has('currentUser') || includeAnalytics;

    // Fetch all data in parallel (single database round trip)
    const [team, members, allRequests] = await Promise.all([
      TeamModel.findById(user.teamId),
      includeMembers ? UserModel.findByTeamId(user.teamId) : Promise.resolve([]),
      includeRequests ? LeaveRequestModel.findByTeamId(user.teamId) : Promise.resolve([]),
    ]);

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get current user data
    const currentUser = includeCurrentUser ? await UserModel.findById(user.id) : null;
    if (includeCurrentUser && !currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate analytics based on role
    let analytics;
    if (includeAnalytics && user.role === 'member' && currentUser) {
      // IMPORTANT: Use grouped analytics to ensure members see the same normalized values as leaders
      // This ensures consistency between member and leader views
      const memberList = members.filter(m => m.role === 'member');
      
      // Calculate grouped analytics first (this normalizes usableDays and recalculates realisticUsableDays)
      const groupedAnalytics = getGroupedTeamAnalytics(memberList, team, allRequests);
      
      // Find the member's analytics from the grouped result
      // IMPORTANT: Convert both to strings for comparison to handle ObjectId vs string mismatches
      let memberAnalytics = null;
      for (const group of groupedAnalytics.groups) {
        const memberInGroup = group.members.find(m => String(m.userId) === String(user.id));
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
    } else if (includeAnalytics && user.role === 'leader') {
      // Return grouped team analytics for leaders
      analytics = getGroupedTeamAnalytics(members, team, allRequests);
    } else if (includeAnalytics) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Build response - include manualLeaveBalance only for leaders
    const isLeader = user.role === 'leader';
    
    const response = {
      ...(include.has('team') ? { team } : {}),
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
        manualLeaveBalance: currentUser.manualLeaveBalance,
        manualYearToDateUsed: currentUser.manualYearToDateUsed,
        manualYearToDateUsedYear: currentUser.manualYearToDateUsedYear,
        manualMaternityLeaveBalance: currentUser.manualMaternityLeaveBalance,
        manualMaternityYearToDateUsed: currentUser.manualMaternityYearToDateUsed,
        maternityPaternityType: currentUser.maternityPaternityType,
        carryoverFromPreviousYear: currentUser.carryoverFromPreviousYear,
        carryoverExpiryDate: currentUser.carryoverExpiryDate,
      } : null,
      } : {}),
      ...(includeMembers ? {
        members: members.map(member => {
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
            maternityPaternityType: member.maternityPaternityType,
          };
        }
        
        return baseMember;
      }),
      } : {}),
      ...(includeRequests ? { requests: requestFields ? allRequests.map(req => pickRequestFields(req)) : allRequests } : {}),
      ...(includeAnalytics ? { analytics: user.role === 'leader' ? analytics : { analytics } } : {}),
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

