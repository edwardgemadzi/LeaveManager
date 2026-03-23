import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';
import { requireAuth, requireSafeUserData } from '@/lib/api-helpers';
import { validateRequest, schemas } from '@/lib/validation';

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

    const normalizedUser = {
      ...userDataResult,
      id: (userDataResult as { _id?: string })._id || (userDataResult as { id?: string }).id,
    };
    return NextResponse.json({ user: normalizedUser });

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
    const validation = validateRequest(schemas.updateProfile, { fullName });
    if (!validation.isValid) {
      return badRequestError('Validation failed', validation.errors);
    }

    // Update user profile
    const db = await getDatabase();
    const users = db.collection('users');
    
    const result = await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { fullName: validation.data.fullName.trim() } }
    );

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    // Get updated safe user data (validates ObjectId and removes password)
    const updatedUserResult = await requireSafeUserData(user.id, 'User not found');
    if (updatedUserResult instanceof NextResponse) {
      return updatedUserResult;
    }
    const safeUserData = {
      ...updatedUserResult,
      id: (updatedUserResult as { _id?: string })._id || (updatedUserResult as { id?: string }).id,
    };

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
