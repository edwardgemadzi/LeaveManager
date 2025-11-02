import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { UserModel } from '@/models/User';
import { ShiftSchedule } from '@/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
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

    // Check if the target user exists
    const targetUser = await UserModel.findById(id);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify leader has access to the target user's team
    if (!targetUser.teamId) {
      return NextResponse.json({ error: 'User has no team' }, { status: 400 });
    }

    // Compare teamIds as strings to handle ObjectId/string mismatches
    const userTeamIdStr = user.teamId?.toString().trim() || '';
    const targetTeamIdStr = targetUser.teamId.toString().trim();
    
    if (userTeamIdStr !== targetTeamIdStr) {
      return NextResponse.json(
        { error: 'Access denied - users must be in the same team' },
        { status: 403 }
      );
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
