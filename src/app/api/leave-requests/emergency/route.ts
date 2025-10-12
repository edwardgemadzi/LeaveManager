import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import bcrypt from 'bcrypt';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden - Leaders only' }, { status: 403 });
    }

    const { memberId, startDate, endDate, reason, password, isEmergency } = await request.json();

    // Validate required fields
    if (!memberId || !startDate || !endDate || !reason || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (!isEmergency) {
      return NextResponse.json({ error: 'This endpoint is for emergency requests only' }, { status: 400 });
    }

    // Verify the leader's password
    const leader = await UserModel.findById(user.id);
    if (!leader) {
      return NextResponse.json({ error: 'Leader not found' }, { status: 404 });
    }

    const isPasswordValid = await bcrypt.compare(password, leader.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Verify the member exists and belongs to the same team
    const member = await UserModel.findById(memberId);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    console.log('Emergency request debug:', {
      leaderId: user.id,
      leaderTeamId: user.teamId,
      memberId: memberId,
      memberTeamId: member.teamId,
      memberUsername: member.username
    });

    // Handle both string and ObjectId teamId comparisons
    const memberTeamId = member.teamId?.toString();
    const userTeamId = user.teamId?.toString();
    
    if (memberTeamId !== userTeamId) {
      console.log('Team ID mismatch:', { memberTeamId, userTeamId, memberId, leaderId: user.id });
      return NextResponse.json({ error: 'Member does not belong to your team' }, { status: 403 });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 });
    }

    // Create the emergency leave request (automatically approved)
    const emergencyRequest = await LeaveRequestModel.create({
      userId: memberId,
      teamId: user.teamId!,
      startDate: start,
      endDate: end,
      reason: reason,
      status: 'approved', // Emergency requests are auto-approved
      requestedBy: user.id, // Track that this was requested by the leader
    });

    // Return the created request
    return NextResponse.json({
      _id: emergencyRequest._id,
      userId: emergencyRequest.userId,
      teamId: emergencyRequest.teamId,
      startDate: emergencyRequest.startDate,
      endDate: emergencyRequest.endDate,
      reason: emergencyRequest.reason,
      status: emergencyRequest.status,
      requestedBy: emergencyRequest.requestedBy,
      createdAt: emergencyRequest.createdAt,
      updatedAt: emergencyRequest.updatedAt,
    });

  } catch (error) {
    console.error('Emergency request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
