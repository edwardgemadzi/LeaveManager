import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { UserModel } from '@/models/User';
import { teamIdsMatch } from '@/lib/helpers';
import { apiRateLimit } from '@/lib/rateLimit';

export async function GET(
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
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }
    
    const db = await getDatabase();
    const users = db.collection('users');
    
    // Get user data
    const userData = await users.findOne({ _id: new ObjectId(id) });
    
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUserData } = userData;

    return NextResponse.json({ user: safeUserData });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
    
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }
    
    const body = await request.json();
    const { fullName, shiftTag, subgroupTag, manualLeaveBalance, manualYearToDateUsed, manualMaternityLeaveBalance, manualMaternityYearToDateUsed } = body;

    if (!fullName && shiftTag === undefined && subgroupTag === undefined && manualLeaveBalance === undefined && manualYearToDateUsed === undefined && manualMaternityLeaveBalance === undefined && manualMaternityYearToDateUsed === undefined) {
      return NextResponse.json(
        { error: 'At least one field is required' },
        { status: 400 }
      );
    }

    // Validate fullName if provided
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length === 0) {
        return NextResponse.json(
          { error: 'Full name must be a non-empty string' },
          { status: 400 }
        );
      }
      if (fullName.length > 100) {
        return NextResponse.json(
          { error: 'Full name must be no more than 100 characters long' },
          { status: 400 }
        );
      }
      // Validate pattern (letters, spaces, hyphens, apostrophes)
      if (!/^[a-zA-Z\s'-]+$/.test(fullName)) {
        return NextResponse.json(
          { error: 'Full name can only contain letters, spaces, hyphens, and apostrophes' },
          { status: 400 }
        );
      }
    }

    // Validate shiftTag if provided
    if (shiftTag !== undefined && shiftTag !== null) {
      if (typeof shiftTag !== 'string') {
        return NextResponse.json(
          { error: 'Shift tag must be a string' },
          { status: 400 }
        );
      }
      if (shiftTag.trim().length > 50) {
        return NextResponse.json(
          { error: 'Shift tag must be no more than 50 characters long' },
          { status: 400 }
        );
      }
    }

    // Validate subgroupTag if provided
    if (subgroupTag !== undefined && subgroupTag !== null) {
      if (typeof subgroupTag !== 'string') {
        return NextResponse.json(
          { error: 'Subgroup tag must be a string' },
          { status: 400 }
        );
      }
      if (subgroupTag.trim().length > 50) {
        return NextResponse.json(
          { error: 'Subgroup tag must be no more than 50 characters long' },
          { status: 400 }
        );
      }
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

    // Compare teamIds using consistent helper
    if (!teamIdsMatch(user.teamId, targetUser.teamId)) {
      return NextResponse.json(
        { error: 'Access denied - users must be in the same team' },
        { status: 403 }
      );
    }

    // Build update object
    const updateData: { fullName?: string; shiftTag?: string; subgroupTag?: string; manualLeaveBalance?: number; manualYearToDateUsed?: number; manualMaternityLeaveBalance?: number; manualMaternityYearToDateUsed?: number } = {};
    const unsetData: { manualLeaveBalance?: string; manualYearToDateUsed?: string; manualMaternityLeaveBalance?: string; manualMaternityYearToDateUsed?: string } = {};
    let shouldUnset = false;
    
    if (fullName) updateData.fullName = fullName;
    if (shiftTag !== undefined) updateData.shiftTag = shiftTag;
    if (subgroupTag !== undefined) {
      // If subgroupTag is empty string, set to undefined (remove subgroup)
      updateData.subgroupTag = subgroupTag && subgroupTag.trim() ? subgroupTag.trim() : undefined;
    }
    if (manualLeaveBalance !== undefined) {
      // If manualLeaveBalance is null, remove it (use calculated balance)
      if (manualLeaveBalance === null) {
        unsetData.manualLeaveBalance = '';
        shouldUnset = true;
      } else {
        // Validate manualLeaveBalance is a number and not negative
        if (typeof manualLeaveBalance !== 'number' || manualLeaveBalance < 0) {
          return NextResponse.json(
            { error: 'manualLeaveBalance must be a non-negative number' },
            { status: 400 }
          );
        }
        
        // Validate maximum limit to prevent abuse (1000 days = ~2.7 years, more than enough)
        const MAX_MANUAL_BALANCE = 1000;
        if (manualLeaveBalance > MAX_MANUAL_BALANCE) {
          return NextResponse.json(
            { error: `manualLeaveBalance cannot exceed ${MAX_MANUAL_BALANCE} days` },
            { status: 400 }
          );
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
          return NextResponse.json(
            { error: 'manualYearToDateUsed must be a non-negative number' },
            { status: 400 }
          );
        }
        
        // Validate maximum limit to prevent abuse (100 days should be sufficient for year-to-date)
        const MAX_MANUAL_DAYS_TAKEN = 100;
        if (manualYearToDateUsed > MAX_MANUAL_DAYS_TAKEN) {
          return NextResponse.json(
            { error: `manualYearToDateUsed cannot exceed ${MAX_MANUAL_DAYS_TAKEN} days` },
            { status: 400 }
          );
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
          return NextResponse.json(
            { error: 'manualMaternityLeaveBalance must be a non-negative number' },
            { status: 400 }
          );
        }
        
        // Validate maximum limit to prevent abuse (1000 days = ~2.7 years, more than enough)
        const MAX_MANUAL_BALANCE = 1000;
        if (manualMaternityLeaveBalance > MAX_MANUAL_BALANCE) {
          return NextResponse.json(
            { error: `manualMaternityLeaveBalance cannot exceed ${MAX_MANUAL_BALANCE} days` },
            { status: 400 }
          );
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
          return NextResponse.json(
            { error: 'manualMaternityYearToDateUsed must be a non-negative number' },
            { status: 400 }
          );
        }
        
        // Validate maximum limit to prevent abuse (365 days should be sufficient for year-to-date)
        const MAX_MANUAL_DAYS_TAKEN = 365;
        if (manualMaternityYearToDateUsed > MAX_MANUAL_DAYS_TAKEN) {
          return NextResponse.json(
            { error: `manualMaternityYearToDateUsed cannot exceed ${MAX_MANUAL_DAYS_TAKEN} days` },
            { status: 400 }
          );
        }
        
        updateData.manualMaternityYearToDateUsed = manualMaternityYearToDateUsed;
      }
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
    
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }
    
    const db = await getDatabase();
    const users = db.collection('users');

    // Check if user exists and is not a leader
    const targetUserDoc = await users.findOne({ _id: new ObjectId(id) });
    if (!targetUserDoc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUserDoc.role === 'leader') {
      return NextResponse.json({ error: 'Cannot delete team leader' }, { status: 400 });
    }

    // Verify leader has access to the target user's team
    const targetUser = await UserModel.findById(id);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

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

    // Delete user's leave requests first
    const leaveRequests = db.collection('leaveRequests');
    await leaveRequests.deleteMany({ userId: id });

    // Delete the user
    const result = await users.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}