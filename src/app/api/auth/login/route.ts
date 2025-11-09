import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { generateToken } from '@/lib/auth';
import { LoginRequest } from '@/types';
import { authRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, badRequestError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (skip in test mode)
    const rateLimitResponse = process.env.NODE_ENV !== 'test' 
      ? authRateLimit(request)
      : null;
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body: LoginRequest = await request.json();
    
    // Validate input
    const validation = validateRequest(schemas.login, body);
    if (!validation.isValid) {
      return badRequestError('Invalid input', validation.errors);
    }

    const { username, password } = validation.data;

    const user = await UserModel.findByUsername(username);
    
    if (!user) {
      return unauthorizedError('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return unauthorizedError('Invalid credentials');
    }

    // Build token data
    const tokenData: {
      id: string;
      username: string;
      role: 'leader' | 'member';
      teamId?: string;
    } = {
      id: user._id!,
      username: user.username,
      role: user.role,
    };
    
    if (user.teamId) {
      tokenData.teamId = user.teamId;
    }

    const token = generateToken(tokenData);

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
    logError('Login error:', error);
    return internalServerError();
  }
}
