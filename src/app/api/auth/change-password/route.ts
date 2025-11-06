import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { validateRequest, schemas } from '@/lib/validation';
import { apiRateLimit } from '@/lib/rateLimit';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, badRequestError, notFoundError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user) {
      return unauthorizedError('Invalid token');
    }

    const body = await request.json();
    
    // Validate input using schema
    const validation = validateRequest(schemas.changePassword, body);
    if (!validation.isValid) {
      return badRequestError('Validation failed', validation.errors);
    }

    const { currentPassword, newPassword } = validation.data;

    // Validate ObjectId format
    if (!ObjectId.isValid(user.id)) {
      return badRequestError('Invalid user ID format');
    }
    
    // Get user from database to verify current password
    const db = await getDatabase();
    const users = db.collection('users');
    
    const userData = await users.findOne({ _id: new ObjectId(user.id) });
    if (!userData) {
      return notFoundError('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.password);
    if (!isCurrentPasswordValid) {
      return badRequestError('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password in database
    const result = await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { password: hashedNewPassword } }
    );

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    return NextResponse.json({
      message: 'Password has been changed successfully'
    });

  } catch (error) {
    logError('Change password error:', error);
    return internalServerError();
  }
}
