import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { UserModel } from '@/models/User';
import { ShiftSchedule } from '@/types';
import { ObjectId } from 'mongodb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    console.log('Schedule API - Token received:', !!token);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    console.log('Schedule API - User verified:', user ? { id: user.id, role: user.role, teamId: user.teamId } : 'null');
    if (!user || user.role !== 'leader') {
      console.log('Schedule API - Forbidden: user role is', user?.role);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { shiftSchedule } = await request.json();

    if (!shiftSchedule) {
      return NextResponse.json(
        { error: 'Shift schedule is required' },
        { status: 400 }
      );
    }

    // Validate shift schedule structure
    if (!shiftSchedule.pattern || !Array.isArray(shiftSchedule.pattern) || 
        !shiftSchedule.startDate || !shiftSchedule.type) {
      return NextResponse.json(
        { error: 'Invalid shift schedule format' },
        { status: 400 }
      );
    }

    // Check if the target user exists and belongs to the same team
    const targetUser = await UserModel.findById(id);
    console.log('Schedule API - Target user:', targetUser ? { id: targetUser._id, teamId: targetUser.teamId } : 'null');
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle both string and ObjectId teamId comparisons
    const userTeamId = user.teamId;
    const targetTeamId = targetUser.teamId;
    const teamIdsMatch = userTeamId === targetTeamId || 
                        userTeamId === targetTeamId?.toString() || 
                        targetTeamId === userTeamId?.toString() ||
                        (targetTeamId instanceof ObjectId && targetTeamId.toString() === userTeamId) ||
                        (userTeamId instanceof ObjectId && userTeamId.toString() === targetTeamId);
    
    console.log('Schedule API - Team ID comparison:', { 
      userTeamId, 
      targetTeamId,
      userTeamIdType: typeof userTeamId,
      targetTeamIdType: typeof targetTeamId,
      match: teamIdsMatch 
    });
    
    if (!teamIdsMatch) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update the shift schedule
    await UserModel.updateShiftSchedule(id, shiftSchedule as ShiftSchedule);

    return NextResponse.json({ success: true, message: 'Shift schedule updated successfully' });
  } catch (error) {
    console.error('Update shift schedule error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
