import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, badRequestError, notFoundError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user) {
      return unauthorizedError('Invalid token');
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(user.id)) {
      return badRequestError('Invalid user ID format');
    }
    
    // Get fresh user data from database
    const db = await getDatabase();
    const users = db.collection('users');
    
    const userData = await users.findOne({ _id: new ObjectId(user.id) });
    if (!userData) {
      return notFoundError('User not found');
    }

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUserData } = userData;

    return NextResponse.json({ user: safeUserData });

  } catch (error) {
    logError('Get profile error:', error);
    return internalServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user) {
      return unauthorizedError('Invalid token');
    }

    const { fullName } = await request.json();

    if (!fullName || fullName.trim().length === 0) {
      return badRequestError('Full name is required');
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(user.id)) {
      return badRequestError('Invalid user ID format');
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

    // Get updated user data
    const updatedUser = await users.findOne({ _id: new ObjectId(user.id) });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUserData } = updatedUser!;

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
