import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { badRequestError, internalServerError } from '@/lib/errors';
import { PasswordResetTokenModel } from '@/models/PasswordResetToken';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { User } from '@/types';
import { passwordRecoveryRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

export async function POST(request: NextRequest) {
  try {
    const limited = await passwordRecoveryRateLimit(request);
    if (limited) return limited;

    const body = (await request.json()) as { token?: string; password?: string };
    const token = (body.token || '').trim();
    if (!token) return badRequestError('token is required');

    const pwValidation = validateRequest(schemas.passwordReset, { password: body.password });
    if (!pwValidation.isValid) {
      return badRequestError('Invalid input', pwValidation.errors);
    }
    const password = pwValidation.data.password;

    const consumed = await PasswordResetTokenModel.consumeActiveByHash(PasswordResetTokenModel.hashToken(token));
    if (!consumed) return badRequestError('Invalid or expired token');

    const hashedPassword = await bcrypt.hash(password, 12);
    const db = await getDatabase();
    await db.collection<User>('users').updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: new ObjectId(consumed.userId) } as any,
      { $set: { password: hashedPassword } }
    );

    return NextResponse.json({ success: true }, { headers: NO_STORE_JSON_HEADERS });
  } catch (error) {
    if (error instanceof SyntaxError) return badRequestError('Invalid request body');
    return internalServerError();
  }
}
