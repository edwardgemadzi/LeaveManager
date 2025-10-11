import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { generateToken } from '@/lib/auth';
import { LoginRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

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
