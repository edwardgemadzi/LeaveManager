import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { generateToken } from '@/lib/auth';
import { LoginRequest } from '@/types';
import { authRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = authRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body: LoginRequest = await request.json();
    
    // Validate input
    const validation = validateRequest(schemas.login, body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.errors },
        { status: 400 }
      );
    }

    const { username, password } = validation.data;

    const user = await UserModel.findByUsername(username);
    console.log('Login API - Found user:', user ? 'Yes' : 'No');
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Login API - Password valid:', isValidPassword);
    console.log('Login API - User teamId:', user.teamId);
    
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = generateToken({
      id: user._id!,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
    });

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        teamId: user.teamId,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
