import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';
import { requireAuth, requireSafeUserData } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    // Get safe user data (validates ObjectId and removes password)
    const userDataResult = await requireSafeUserData(user.id, 'User not found');
    if (userDataResult instanceof NextResponse) {
      return userDataResult;
    }

    return NextResponse.json({ user: userDataResult });

  } catch (error) {
    logError('Get profile error:', error);
    return internalServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Require authentication
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const { fullName } = await request.json();

    if (!fullName || fullName.trim().length === 0) {
      return badRequestError('Full name is required');
    }

    // Update user profile
    const db = await getDatabase();
    const users = db.collection('users');
    
    const result = await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { fullName: fullName.trim() } }
    );

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    // Get updated safe user data (validates ObjectId and removes password)
    const updatedUserResult = await requireSafeUserData(user.id, 'User not found');
    if (updatedUserResult instanceof NextResponse) {
      return updatedUserResult;
    }
    const safeUserData = updatedUserResult;

    return NextResponse.json({ 
      success: true, 
      user: safeUserData,
      message: 'Profile updated successfully' 
    });

  } catch (error) {
    logError('Update profile error:', error);
    return internalServerError();
  }
}
