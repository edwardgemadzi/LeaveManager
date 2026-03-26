import { NextRequest, NextResponse } from 'next/server';
import { badRequestError, internalServerError } from '@/lib/errors';
import { PasswordResetTokenModel } from '@/models/PasswordResetToken';
import { passwordRecoveryRateLimit } from '@/lib/rateLimit';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

export async function GET(request: NextRequest) {
  try {
    const limited = passwordRecoveryRateLimit(request);
    if (limited) return limited;

    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) return badRequestError('token is required');
    const stored = await PasswordResetTokenModel.findActiveByHash(PasswordResetTokenModel.hashToken(token));
    return NextResponse.json({ valid: !!stored }, { headers: NO_STORE_JSON_HEADERS });
  } catch {
    return internalServerError();
  }
}
