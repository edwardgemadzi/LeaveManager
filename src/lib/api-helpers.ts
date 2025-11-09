import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { AuthUser, User } from '@/types';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { unauthorizedError, forbiddenError, notFoundError } from '@/lib/errors';

/**
 * Authentication helper options
 */
interface RequireAuthOptions {
  /**
   * Require user to be a leader (default: false)
   */
  requireLeader?: boolean;
  /**
   * Custom error message for unauthorized (default: 'Unauthorized')
   */
  unauthorizedMessage?: string;
  /**
   * Custom error message for forbidden (default: 'Forbidden')
   */
  forbiddenMessage?: string;
}

/**
 * Require authentication and optionally require leader role
 * Returns the authenticated user or an error response
 * 
 * @param request - Next.js request object
 * @param options - Authentication options
 * @returns AuthUser if authenticated, or NextResponse error if not
 */
export function requireAuth(
  request: NextRequest,
  options: RequireAuthOptions = {}
): AuthUser | NextResponse {
  const {
    requireLeader = false,
    unauthorizedMessage = 'Unauthorized',
    forbiddenMessage = 'Forbidden',
  } = options;

  const token = getTokenFromRequest(request);
  if (!token) {
    return unauthorizedError(unauthorizedMessage);
  }

  const user = verifyToken(token);
  if (!user) {
    return unauthorizedError(unauthorizedMessage);
  }

  if (requireLeader && user.role !== 'leader') {
    return forbiddenError(forbiddenMessage);
  }

  return user;
}

/**
 * Require authentication and leader role
 * Convenience wrapper for requireAuth with requireLeader: true
 * 
 * @param request - Next.js request object
 * @param forbiddenMessage - Custom error message for forbidden (default: 'Forbidden')
 * @returns AuthUser if authenticated leader, or NextResponse error if not
 */
export function requireLeader(
  request: NextRequest,
  forbiddenMessage = 'Forbidden'
): AuthUser | NextResponse {
  return requireAuth(request, {
    requireLeader: true,
    forbiddenMessage,
  });
}

/**
 * Get safe user data from database (without password)
 * 
 * @param userId - User ID (string or ObjectId)
 * @returns User data without password, or null if not found
 */
export async function getSafeUserData(
  userId: string | ObjectId
): Promise<Omit<User, 'password'> | null> {
  // Validate ObjectId format if string
  if (typeof userId === 'string' && !ObjectId.isValid(userId)) {
    return null;
  }

  const db = await getDatabase();
  const users = db.collection('users');

  const userData = await users.findOne({
    _id: typeof userId === 'string' ? new ObjectId(userId) : userId,
  });

  if (!userData) {
    return null;
  }

  // Remove sensitive data and convert ObjectId to string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safeUserData } = userData;
  
  // Convert _id from ObjectId to string if it exists
  const result: Omit<User, 'password'> = {
    ...safeUserData,
    _id: userData._id ? userData._id.toString() : undefined,
  } as Omit<User, 'password'>;

  return result;
}

/**
 * Get safe user data or return error response
 * 
 * @param userId - User ID (string or ObjectId)
 * @param notFoundMessage - Custom error message for not found (default: 'User not found')
 * @returns User data without password, or NextResponse error if not found
 */
export async function requireSafeUserData(
  userId: string | ObjectId,
  notFoundMessage = 'User not found'
): Promise<Omit<User, 'password'> | NextResponse> {
  // Validate ObjectId format if string
  if (typeof userId === 'string' && !ObjectId.isValid(userId)) {
    return notFoundError(notFoundMessage);
  }

  const userData = await getSafeUserData(userId);
  if (!userData) {
    return notFoundError(notFoundMessage);
  }

  return userData;
}

