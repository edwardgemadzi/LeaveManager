import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { UserModel } from '@/models/User';

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
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { fullName, shiftTag, subgroupTag, manualLeaveBalance } = body;

    if (!fullName && shiftTag === undefined && subgroupTag === undefined && manualLeaveBalance === undefined) {
      return NextResponse.json(
        { error: 'At least one field is required' },
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

    // Build update object
    const updateData: { fullName?: string; shiftTag?: string; subgroupTag?: string; manualLeaveBalance?: number } = {};
    const unsetData: { manualLeaveBalance?: string } = {};
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
        updateData.manualLeaveBalance = manualLeaveBalance;
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
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
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