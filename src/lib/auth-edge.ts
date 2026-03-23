import { jwtVerify } from 'jose';
import { AuthUser } from '@/types';

interface DecodedToken {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
  selectedTeamId?: string;
  teamIds?: string[];
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET environment variable is required and must be at least 32 characters long. ' +
      'Please set JWT_SECRET in your environment variables.'
  );
}

const secretKey = new TextEncoder().encode(JWT_SECRET);

export async function verifyTokenEdge(token: string): Promise<AuthUser | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey);
    const decoded = payload as unknown as DecodedToken;

    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      teamId:
        decoded.teamId ||
        decoded.selectedTeamId ||
        (decoded.teamIds && decoded.teamIds.length > 0 ? decoded.teamIds[0] : undefined),
    };
  } catch {
    return null;
  }
}
