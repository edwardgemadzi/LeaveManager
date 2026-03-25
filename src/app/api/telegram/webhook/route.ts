import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { error as logError } from '@/lib/logger';
import { TelegramLinkTokenModel } from '@/models/TelegramLinkToken';
import { parseStartDeepLinkPayload } from '@/lib/telegramDeepLink';
import {
  normalizeTelegramUserChatId,
  sendTelegramMessageWithOutcome,
} from '@/lib/telegram';

type TelegramUpdate = {
  message?: {
    message_id?: number;
    from?: { id?: number; username?: string; is_bot?: boolean };
    chat?: { id?: number; type?: string };
    text?: string;
  };
};

function verifyWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const header = request.headers.get('x-telegram-bot-api-secret-token');
  return header === expected;
}

/**
 * POST /api/telegram/webhook
 * Telegram Bot API updates (deep-link /start completion). Register with setWebhook + secret_token.
 */
export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.from || msg.from.is_bot) {
    return NextResponse.json({ ok: true });
  }

  const chatId = msg.chat?.id;
  if (chatId === undefined || msg.chat?.type !== 'private') {
    return NextResponse.json({ ok: true });
  }

  const payload = parseStartDeepLinkPayload(msg.text);
  if (!payload) {
    if (msg.text?.trim().startsWith('/start')) {
      const out = await sendTelegramMessageWithOutcome({
        chatId: String(chatId),
        text:
          'To link Leave Manager: sign in on the website → Profile → “Link in Telegram app”, open the link there, then tap Start again from that link.',
      });
      if (!out.ok) {
        logError('[telegram webhook] help reply failed:', out.description);
      }
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const claimed = await TelegramLinkTokenModel.findOneAndDeleteValid(payload);
    if (!claimed) {
      const out = await sendTelegramMessageWithOutcome({
        chatId: String(chatId),
        text:
          'This link is invalid or expired. Open Leave Manager in your browser, generate a new “Link in Telegram app” link, then tap Start from that link.',
      });
      if (!out.ok) {
        logError('[telegram webhook] expired token reply failed:', out.description);
      }
      return NextResponse.json({ ok: true });
    }

    const from = msg.from;
    const telegramUserId = normalizeTelegramUserChatId(from.id);
    if (!telegramUserId) {
      return NextResponse.json({ ok: true });
    }

    const telegramUsername = from.username?.trim() || null;

    const db = await getDatabase();
    const users = db.collection('users');
    const upd = await users.updateOne(
      { _id: claimed.userId },
      {
        $set: {
          telegramUserId,
          telegramUsername,
          notifyTelegram: true,
        },
      }
    );

    if (upd.matchedCount === 0) {
      logError('[telegram webhook] user missing for token:', claimed.userId.toString());
      return NextResponse.json({ ok: true });
    }

    const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
    const welcome = await sendTelegramMessageWithOutcome({
      chatId: telegramUserId,
      text: `✅ ${appName}: your account is linked. Leave notifications will be sent here. You can return to the website — refresh your profile if needed.`,
    });

    if (!welcome.ok) {
      logError('[telegram webhook] welcome DM failed:', welcome.description);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
