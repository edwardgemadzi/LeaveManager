import jwt from 'jsonwebtoken';
import { AuthUser } from '@/types';

// Validate JWT_SECRET on initialization - fail fast if missing or invalid
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable is required and must be at least 32 characters long. ' +
    'Please set JWT_SECRET in your environment variables.'
  );
}

export const generateToken = (user: AuthUser): string => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
};

interface DecodedToken {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
  // Legacy fields for backward compatibility
  selectedTeamId?: string;
  teamIds?: string[];
}

export const verifyToken = (token: string): AuthUser | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    // Handle old tokens that might have teamIds/selectedTeamId - map to single teamId
    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      // Use selectedTeamId or first teamIds entry if teamId is missing (for old tokens)
      teamId: decoded.teamId || decoded.selectedTeamId || (decoded.teamIds && decoded.teamIds.length > 0 ? decoded.teamIds[0] : undefined),
    };
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
};

export const getTokenFromRequest = (request: Request): string | null => {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};
