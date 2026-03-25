import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import {
  AUTH_REMEMBER_JWT_EXPIRES_IN,
  AUTH_REMEMBER_ME_MAX_AGE_SEC,
  AUTH_SESSION_JWT_EXPIRES_IN,
  generateToken,
  setAuthCookie,
} from '@/lib/auth';
import { LoginRequest } from '@/types';
import { authRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, badRequestError } from '@/lib/errors';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

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

    const username = validation.data.username.toLowerCase();
    const { password } = validation.data;
    // Omitting the field (older clients) keeps prior behavior: stay signed in with a persistent cookie.
    const rememberMe = validation.data.rememberMe !== false;

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

    const token = rememberMe
      ? generateToken(tokenData, AUTH_REMEMBER_JWT_EXPIRES_IN)
      : generateToken(tokenData, AUTH_SESSION_JWT_EXPIRES_IN);

    const response = NextResponse.json(
      {
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          teamId: user.teamId,
        },
      },
      { headers: NO_STORE_JSON_HEADERS }
    );

    setAuthCookie(response, token, {
      maxAgeSeconds: rememberMe ? AUTH_REMEMBER_ME_MAX_AGE_SEC : null,
    });
    return response;
  } catch (error) {
    logError('Login error:', error);
    return internalServerError();
  }
}
