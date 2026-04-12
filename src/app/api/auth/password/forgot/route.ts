import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { badRequestError, internalServerError } from '@/lib/errors';
import { UserModel } from '@/models/User';
import { PasswordResetTokenModel } from '@/models/PasswordResetToken';
import { sendHtmlEmail, shell, escapeForHtml } from '@/lib/mailer';
import { passwordRecoveryRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

export async function POST(request: NextRequest) {
  try {
    const limited = await passwordRecoveryRateLimit(request);
    if (limited) return limited;

    const body = (await request.json()) as { identifier?: string };
    const validation = validateRequest(schemas.passwordForgot, body);
    if (!validation.isValid) {
      return badRequestError('Invalid input', validation.errors);
    }

    const identifier = validation.data.identifier.trim();

    const user = identifier.includes('@')
      ? await UserModel.findByEmail(identifier.toLowerCase())
      : await UserModel.findByUsername(identifier.toLowerCase());

    if (!user || !user.email) {
      return NextResponse.json({ success: true }, { headers: NO_STORE_JSON_HEADERS });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    await PasswordResetTokenModel.create({
      userId: user._id!,
      tokenHash: PasswordResetTokenModel.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : null) ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const html = shell(
      `<p style="margin:0 0 16px;">Reset your password using the secure link below:</p>
       <p style="margin:0 0 20px;"><a href="${resetUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block;">Reset password</a></p>
       <p style="margin:0;color:#64748b;">If you did not request this, you can ignore this email.</p>
       <p style="margin:12px 0 0;color:#64748b;font-size:12px;">Link: ${escapeForHtml(resetUrl)}</p>`,
      { title: 'Password reset request', preheader: 'Reset your password' }
    );
    await sendHtmlEmail({ to: user.email, subject: 'Reset your Leave Manager password', html });

    return NextResponse.json({ success: true }, { headers: NO_STORE_JSON_HEADERS });
  } catch (error) {
    if (error instanceof SyntaxError) return badRequestError('Invalid request body');
    return internalServerError();
  }
}
