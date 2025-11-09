import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError, forbiddenError } from '@/lib/errors';
import { requireLeader, requireSafeUserData } from '@/lib/api-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { id } = await params;
    
    // Get safe user data (validates ObjectId and removes password)
    const userDataResult = await requireSafeUserData(id, 'User not found');
    if (userDataResult instanceof NextResponse) {
      return userDataResult;
    }

    return NextResponse.json({ user: userDataResult });
  } catch (error) {
    logError('Get user error:', error);
    return internalServerError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const { id } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }
    
    const body = await request.json();
    const { fullName, shiftTag, subgroupTag, manualLeaveBalance, manualYearToDateUsed, manualMaternityLeaveBalance, manualMaternityYearToDateUsed, newPassword, maternityPaternityType } = body;

    if (!fullName && shiftTag === undefined && subgroupTag === undefined && manualLeaveBalance === undefined && manualYearToDateUsed === undefined && manualMaternityLeaveBalance === undefined && manualMaternityYearToDateUsed === undefined && !newPassword && maternityPaternityType === undefined) {
      return badRequestError('At least one field is required');
    }

    // Validate fullName if provided
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length === 0) {
        return badRequestError('Full name must be a non-empty string');
      }
      if (fullName.length > 100) {
        return badRequestError('Full name must be no more than 100 characters long');
      }
      // Validate pattern (letters, spaces, hyphens, apostrophes)
      if (!/^[a-zA-Z\s'-]+$/.test(fullName)) {
        return badRequestError('Full name can only contain letters, spaces, hyphens, and apostrophes');
      }
    }

    // Validate shiftTag if provided
    if (shiftTag !== undefined && shiftTag !== null) {
      if (typeof shiftTag !== 'string') {
        return badRequestError('Shift tag must be a string');
      }
      if (shiftTag.trim().length > 50) {
        return badRequestError('Shift tag must be no more than 50 characters long');
      }
    }

    // Validate subgroupTag if provided
    if (subgroupTag !== undefined && subgroupTag !== null) {
      if (typeof subgroupTag !== 'string') {
        return badRequestError('Subgroup tag must be a string');
      }
      if (subgroupTag.trim().length > 50) {
        return badRequestError('Subgroup tag must be no more than 50 characters long');
      }
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

    // Compare teamIds using consistent helper
    if (!teamIdsMatch(user.teamId, targetUser.teamId)) {
      return forbiddenError('Access denied - users must be in the same team');
    }

    // Validate newPassword if provided
    if (newPassword !== undefined) {
      if (typeof newPassword !== 'string' || newPassword.trim().length === 0) {
        return badRequestError('Password must be a non-empty string');
      }
      if (newPassword.length < 6) {
        return badRequestError('Password must be at least 6 characters long');
      }
      if (newPassword.length > 100) {
        return badRequestError('Password must be no more than 100 characters long');
      }
    }

    // Validate maternityPaternityType if provided
    if (maternityPaternityType !== undefined) {
      if (maternityPaternityType !== null && maternityPaternityType !== 'maternity' && maternityPaternityType !== 'paternity') {
        return badRequestError('maternityPaternityType must be "maternity", "paternity", or null');
      }
    }

    // Build update object
    const updateData: { fullName?: string; shiftTag?: string; subgroupTag?: string; manualLeaveBalance?: number; manualYearToDateUsed?: number; manualMaternityLeaveBalance?: number; manualMaternityYearToDateUsed?: number; password?: string; maternityPaternityType?: 'maternity' | 'paternity' | null } = {};
    const unsetData: { manualLeaveBalance?: string; manualYearToDateUsed?: string; manualMaternityLeaveBalance?: string; manualMaternityYearToDateUsed?: string } = {};
    let shouldUnset = false;
    
    if (fullName) updateData.fullName = fullName;
    if (shiftTag !== undefined) updateData.shiftTag = shiftTag;
    if (subgroupTag !== undefined) {
      // If subgroupTag is empty string, set to undefined (remove subgroup)
      updateData.subgroupTag = subgroupTag && subgroupTag.trim() ? subgroupTag.trim() : undefined;
    }
    if (maternityPaternityType !== undefined) {
      updateData.maternityPaternityType = maternityPaternityType;
    }
    if (manualLeaveBalance !== undefined) {
      // If manualLeaveBalance is null, remove it (use calculated balance)
      if (manualLeaveBalance === null) {
        unsetData.manualLeaveBalance = '';
        shouldUnset = true;
      } else {
        // Validate manualLeaveBalance is a number and not negative
        if (typeof manualLeaveBalance !== 'number' || manualLeaveBalance < 0) {
          return badRequestError('manualLeaveBalance must be a non-negative number');
        }
        
        // Validate maximum limit to prevent abuse (1000 days = ~2.7 years, more than enough)
        const MAX_MANUAL_BALANCE = 1000;
        if (manualLeaveBalance > MAX_MANUAL_BALANCE) {
          return badRequestError(`manualLeaveBalance cannot exceed ${MAX_MANUAL_BALANCE} days`);
        }
        
        updateData.manualLeaveBalance = manualLeaveBalance;
      }
    }
    if (manualYearToDateUsed !== undefined) {
      // If manualYearToDateUsed is null, remove it (use calculated value)
      if (manualYearToDateUsed === null) {
        unsetData.manualYearToDateUsed = '';
        shouldUnset = true;
      } else {
        // Validate manualYearToDateUsed is a number and not negative
        if (typeof manualYearToDateUsed !== 'number' || manualYearToDateUsed < 0) {
          return badRequestError('manualYearToDateUsed must be a non-negative number');
        }
        
        // Validate maximum limit to prevent abuse (100 days should be sufficient for year-to-date)
        const MAX_MANUAL_DAYS_TAKEN = 100;
        if (manualYearToDateUsed > MAX_MANUAL_DAYS_TAKEN) {
          return badRequestError(`manualYearToDateUsed cannot exceed ${MAX_MANUAL_DAYS_TAKEN} days`);
        }
        
        updateData.manualYearToDateUsed = manualYearToDateUsed;
      }
    }
    if (manualMaternityLeaveBalance !== undefined) {
      // If manualMaternityLeaveBalance is null, remove it (use calculated balance)
      if (manualMaternityLeaveBalance === null) {
        unsetData.manualMaternityLeaveBalance = '';
        shouldUnset = true;
      } else {
        // Validate manualMaternityLeaveBalance is a number and not negative
        if (typeof manualMaternityLeaveBalance !== 'number' || manualMaternityLeaveBalance < 0) {
          return badRequestError('manualMaternityLeaveBalance must be a non-negative number');
        }
        
        // Validate maximum limit to prevent abuse (1000 days = ~2.7 years, more than enough)
        const MAX_MANUAL_BALANCE = 1000;
        if (manualMaternityLeaveBalance > MAX_MANUAL_BALANCE) {
          return badRequestError(`manualMaternityLeaveBalance cannot exceed ${MAX_MANUAL_BALANCE} days`);
        }
        
        updateData.manualMaternityLeaveBalance = manualMaternityLeaveBalance;
      }
    }
    if (manualMaternityYearToDateUsed !== undefined) {
      // If manualMaternityYearToDateUsed is null, remove it (use calculated value)
      if (manualMaternityYearToDateUsed === null) {
        unsetData.manualMaternityYearToDateUsed = '';
        shouldUnset = true;
      } else {
        // Validate manualMaternityYearToDateUsed is a number and not negative
        if (typeof manualMaternityYearToDateUsed !== 'number' || manualMaternityYearToDateUsed < 0) {
          return badRequestError('manualMaternityYearToDateUsed must be a non-negative number');
        }
        
        // Validate maximum limit to prevent abuse (365 days should be sufficient for year-to-date)
        const MAX_MANUAL_DAYS_TAKEN = 365;
        if (manualMaternityYearToDateUsed > MAX_MANUAL_DAYS_TAKEN) {
          return badRequestError(`manualMaternityYearToDateUsed cannot exceed ${MAX_MANUAL_DAYS_TAKEN} days`);
        }
        
        updateData.manualMaternityYearToDateUsed = manualMaternityYearToDateUsed;
      }
    }
    if (newPassword) {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      updateData.password = hashedPassword;
    }

    // Update user
    const db = await getDatabase();
    const users = db.collection('users');
    const updateOperation: { $set?: typeof updateData; $unset?: typeof unsetData } = {};
    
    if (Object.keys(updateData).length > 0) {
      updateOperation.$set = updateData;
    }
    
    if (shouldUnset && Object.keys(unsetData).length > 0) {
      updateOperation.$unset = unsetData;
    }
    
    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    // Broadcast event if member data was updated (especially maternityPaternityType)
    // Get the updated user to broadcast their teamId
    const updatedUser = await users.findOne({ _id: new ObjectId(id) });
    if (updatedUser && updatedUser.teamId) {
      const { broadcastTeamUpdate } = await import('@/lib/teamEvents');
      broadcastTeamUpdate(updatedUser.teamId, 'settingsUpdated', {
        message: 'Member data updated',
        userId: id
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Update user error:', error);
    return internalServerError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const { id } = await params;
    
    // Get safe user data (validates ObjectId and removes password)
    const userDataResult = await requireSafeUserData(id, 'User not found');
    if (userDataResult instanceof NextResponse) {
      return userDataResult;
    }
    const targetUserDoc = userDataResult;

    if (targetUserDoc.role === 'leader') {
      return badRequestError('Cannot delete team leader');
    }

    // Verify leader has access to the target user's team
    const targetUser = await UserModel.findById(id);
    if (!targetUser) {
      return notFoundError('User not found');
    }

    if (!targetUser.teamId) {
      return badRequestError('User has no team');
    }

    // Compare teamIds as strings to handle ObjectId/string mismatches
    const userTeamIdStr = user.teamId?.toString().trim() || '';
    const targetTeamIdStr = targetUser.teamId.toString().trim();
    
    if (userTeamIdStr !== targetTeamIdStr) {
      return forbiddenError('Access denied - users must be in the same team');
    }

    // Delete user's leave requests first
    const db = await getDatabase();
    const leaveRequests = db.collection('leaveRequests');
    await leaveRequests.deleteMany({ userId: id });

    // Delete the user
    const users = db.collection('users');
    const result = await users.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return notFoundError('User not found');
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logError('Delete user error:', error);
    return internalServerError();
  }
}