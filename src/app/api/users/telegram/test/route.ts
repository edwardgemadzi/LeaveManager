import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb';
import { shouldRejectCsrf } from '@/lib/auth';
import { requireAuth } from '@/lib/api-helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import {
  getTelegramBotIdentity,
  normalizeTelegramUserChatId,
  sendTelegramMessageWithOutcome,
  telegramPublicUsernameMatchesTokenBot,
} from '@/lib/telegram';
import { internalServerError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';

/**
 * POST /api/users/telegram/test
 * Send a one-off test DM to the logged-in user's linked Telegram id.
 * Helps debug token, bot mismatch, and "must tap Start" issues.
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
    const auth = authResult;

    const db = await getDatabase();
    const users = db.collection('users');
    const doc = await users.findOne({ _id: new ObjectId(auth.id) });
    if (!doc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rawId = doc.telegramUserId as string | number | undefined | null;
    const chatId = normalizeTelegramUserChatId(rawId);
    if (!chatId) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'NOT_LINKED',
          message: 'No Telegram account linked, or stored id is invalid. Link again from your profile.',
        },
        { status: 400 }
      );
    }

    if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'NO_TOKEN',
          message: 'Server is missing TELEGRAM_BOT_TOKEN (set it in deployment env).',
        },
        { status: 503 }
      );
    }

    const identity = await getTelegramBotIdentity();
    if (!identity.ok) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'TOKEN_INVALID',
          message: 'Bot token rejected by Telegram (getMe failed). Regenerate token in @BotFather.',
          telegramDescription: identity.description,
        },
        { status: 502 }
      );
    }

    const match = telegramPublicUsernameMatchesTokenBot(identity.username);
    if (!match.matches) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'BOT_MISMATCH',
          message:
            'TELEGRAM_BOT_TOKEN is for a different bot than NEXT_PUBLIC_TELEGRAM_BOT_USERNAME. The Login Widget and sends must use the same bot.',
          tokenBotUsername: match.actual,
          expectedPublicUsername: match.expected,
        },
        { status: 503 }
      );
    }

    const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
    const send = await sendTelegramMessageWithOutcome({
      chatId,
      text: `🔔 ${appName} test message — if you see this, Telegram delivery is working.`,
    });

    if (!send.ok) {
      return NextResponse.json({
        ok: false,
        delivered: false,
        reason: 'TELEGRAM_REJECTED',
        message:
          'Telegram refused the message. Open your bot in the Telegram app, tap Start, then try again. If it still fails, check whether you blocked the bot.',
        telegramDescription: send.description,
        tokenBotUsername: identity.username,
      });
    }

    return NextResponse.json({
      ok: true,
      delivered: true,
      tokenBotUsername: identity.username,
      message: 'Test message sent. Check Telegram.',
    });
  } catch (error) {
    logError('Telegram test message error:', error);
    return internalServerError();
  }
}
