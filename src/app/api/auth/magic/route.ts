import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLinkToken, normalizeNextPath } from '@/lib/magicLink';
import { UserModel } from '@/models/User';
import { generateToken, setAuthCookie } from '@/lib/auth';

/**
 * GET /api/auth/magic?token=...
 * Single-use magic link sign-in + redirect to a safe relative path.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  const consumed = await consumeMagicLinkToken(token);
  if (!consumed) {
    return NextResponse.redirect(new URL('/login', url));
  }

  const user = await UserModel.findById(consumed.userId);
  if (!user) {
    return NextResponse.redirect(new URL('/login', url));
  }

  const jwtToken = generateToken({
    id: String(user._id),
    username: user.username,
    role: user.role,
    teamId: user.teamId ? String(user.teamId) : undefined,
  });

  const next = normalizeNextPath(consumed.nextPath);
  const response = NextResponse.redirect(new URL(next, url));
  setAuthCookie(response, jwtToken);
  return response;
}

