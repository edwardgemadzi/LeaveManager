import { NextRequest, NextResponse } from 'next/server';
import { UserModel } from '@/models/User';
import { ShiftSchedule } from '@/types';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError, forbiddenError } from '@/lib/errors';
import { requireLeader } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const { id } = await params;
    const { shiftSchedule } = await request.json();

    if (!shiftSchedule) {
      return badRequestError('Shift schedule is required');
    }

    // Validate shift schedule structure
    if (!shiftSchedule.pattern || !Array.isArray(shiftSchedule.pattern) || 
        !shiftSchedule.startDate || !shiftSchedule.type) {
      return badRequestError('Invalid shift schedule format');
    }

    // Check if the target user exists
    const targetUser = await UserModel.findById(id);
    if (!targetUser) {
      return notFoundError('User not found');
    }

    // Verify leader has access to the target user's team
    if (!targetUser.teamId) {
      return badRequestError('User has no team');
    }

    // Compare teamIds as strings to handle ObjectId/string mismatches
    const userTeamIdStr = user.teamId?.toString().trim() || '';
    const targetTeamIdStr = targetUser.teamId.toString().trim();
    
    if (userTeamIdStr !== targetTeamIdStr) {
      return forbiddenError('Access denied - users must be in the same team');
    }

    // Update the shift schedule
    await UserModel.updateShiftSchedule(id, shiftSchedule as ShiftSchedule);

    return NextResponse.json({ success: true, message: 'Shift schedule updated successfully' });
  } catch (error) {
    logError('Update shift schedule error:', error);
    return internalServerError();
  }
}
