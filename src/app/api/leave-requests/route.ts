import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { CreateLeaveRequest } from '@/types';

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

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId || teamId !== user.teamId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requests = await LeaveRequestModel.findByTeamId(teamId);
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Get leave requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body: CreateLeaveRequest = await request.json();
    const { startDate, endDate, reason, requestedFor } = body;

    if (!startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: 'Start date, end date, and reason are required' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return NextResponse.json(
        { error: 'End date must be on or after start date' },
        { status: 400 }
      );
    }

    // Determine the user ID for the request
    const requestUserId = requestedFor || user.id;

    // Get team settings for validation
    const team = await TeamModel.findById(user.teamId!);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check minimum notice period
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    const requestStartDate = new Date(start);
    requestStartDate.setHours(0, 0, 0, 0); // Reset time to start of day
    
    const daysDifference = Math.ceil((requestStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference < team.settings.minimumNoticePeriod) {
      return NextResponse.json(
        { 
          error: `Leave requests must be submitted at least ${team.settings.minimumNoticePeriod} day(s) in advance. Please select a start date ${team.settings.minimumNoticePeriod} or more days from today.` 
        },
        { status: 400 }
      );
    }

    // Check concurrent leave limit (considering shift tags)
    const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
      user.teamId!,
      start,
      end
    );

    // Get the requesting user's shift tag
    const requestingUser = await UserModel.findById(requestUserId);
    const requestingUserShiftTag = requestingUser?.shiftTag;

    // Count overlapping requests from users with the same shift tag
    let sameShiftOverlappingCount = 0;
    for (const req of overlappingRequests) {
      const reqUser = await UserModel.findById(req.userId);
      if (reqUser?.shiftTag === requestingUserShiftTag) {
        sameShiftOverlappingCount++;
      }
    }

    // If user has a shift tag, only count overlapping requests from same shift
    // If no shift tag, count all overlapping requests
    const relevantOverlappingCount = requestingUserShiftTag 
      ? sameShiftOverlappingCount
      : overlappingRequests.length;

    if (relevantOverlappingCount >= team.settings.concurrentLeave) {
      const shiftContext = requestingUserShiftTag 
        ? ` (${requestingUserShiftTag} shift)`
        : '';
      return NextResponse.json(
        { 
          error: `Concurrent leave limit exceeded${shiftContext}. Maximum ${team.settings.concurrentLeave} team member(s) can be on leave simultaneously.` 
        },
        { status: 400 }
      );
    }

    // Create the leave request
    const leaveRequest = await LeaveRequestModel.create({
      userId: requestUserId,
      teamId: user.teamId!,
      startDate: start,
      endDate: end,
      reason,
      status: 'pending',
      requestedBy: requestedFor ? user.id : undefined,
    });

    return NextResponse.json(leaveRequest);
  } catch (error) {
    console.error('Create leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
