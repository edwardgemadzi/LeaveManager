import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { shouldRejectCsrf } from '@/lib/auth';
import { requireAuth } from '@/lib/api-helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import { internalServerError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';
import { TelegramLinkTokenModel } from '@/models/TelegramLinkToken';
import {
  generateTelegramDeepLinkToken,
  TELEGRAM_DEEP_LINK_TTL_MS,
} from '@/lib/telegramDeepLink';

/**
 * POST /api/users/telegram/deep-link
 * Create a one-time t.me deep link so the user can link Telegram in the app (no Login Widget).
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (shouldRejectCsrf(request)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const authUser = authResult;

    const tokenEnv = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    if (!tokenEnv || !botUsername) {
      return NextResponse.json(
        { error: 'Telegram is not configured on the server.' },
        { status: 503 }
      );
    }

    if (!webhookSecret) {
      return NextResponse.json(
        {
          error:
            'Deep link linking requires TELEGRAM_WEBHOOK_SECRET and a registered webhook. See .env.example.',
        },
        { status: 503 }
      );
    }

    const userObjectId = new ObjectId(authUser.id);
    const token = generateTelegramDeepLinkToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TELEGRAM_DEEP_LINK_TTL_MS);

    await TelegramLinkTokenModel.deleteManyForUser(userObjectId);
    await TelegramLinkTokenModel.insert({
      token,
      userId: userObjectId,
      createdAt: now,
      expiresAt,
    });

    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    return NextResponse.json({
      success: true,
      deepLink,
      expiresAt: expiresAt.toISOString(),
      message:
        'Open the link in Telegram and tap Start. Keep this tab open — your profile will update when linking completes.',
    });
  } catch (error) {
    logError('Telegram deep-link token error:', error);
    return internalServerError();
  }
}
