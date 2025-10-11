import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get fresh user data from database
    const db = await getDatabase();
    const users = db.collection('users');
    
    const userData = await users.findOne({ _id: new ObjectId(user.id) });
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUserData } = userData;

    return NextResponse.json({ user: safeUserData });

  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { fullName } = await request.json();

    if (!fullName || fullName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Full name is required' },
        { status: 400 }
      );
    }

    // Update user profile
    const db = await getDatabase();
    const users = db.collection('users');
    
    const result = await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { fullName: fullName.trim() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
