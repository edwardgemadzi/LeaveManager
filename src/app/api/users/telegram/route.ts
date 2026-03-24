import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb';
import { shouldRejectCsrf } from '@/lib/auth';
import { requireAuth, requireSafeUserData } from '@/lib/api-helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { verifyTelegramLoginPayload } from '@/lib/telegramAuth';
import {
  normalizeTelegramUserChatId,
  sendTelegramMessageWithOutcome,
} from '@/lib/telegram';
import { badRequestError, internalServerError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';
import { computeNeedsNotificationSetup } from '@/lib/notificationPrompt';

/**
 * POST /api/users/telegram
 * Link Telegram account using Telegram Login Widget payload (verified server-side).
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
    const user = authResult;

    const body = await request.json();
    const validation = validateRequest(schemas.telegramLogin, body);
    if (!validation.isValid) {
      return badRequestError('Validation failed', validation.errors);
    }

    const payload = validation.data as Record<string, string | number | undefined>;
    const stringMap: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v === undefined || v === null) continue;
      stringMap[k] = typeof v === 'number' ? String(v) : String(v);
    }

    if (!verifyTelegramLoginPayload(stringMap)) {
      return NextResponse.json({ error: 'Invalid Telegram authentication' }, { status: 401 });
    }

    const telegramUserId = normalizeTelegramUserChatId(stringMap.id);
    if (!telegramUserId) {
      return badRequestError('Invalid Telegram user id from login payload');
    }
    const telegramUsername = stringMap.username || undefined;

    const db = await getDatabase();
    const users = db.collection('users');

    await users.updateOne(
      { _id: new ObjectId(user.id) },
      {
        $set: {
          telegramUserId,
          telegramUsername: telegramUsername || null,
          notifyTelegram: true,
        },
      }
    );

    const updated = await requireSafeUserData(user.id, 'User not found');
    if (updated instanceof NextResponse) {
      return updated;
    }

    const safe = {
      ...updated,
      id: (updated as { _id?: string })._id,
      telegramUserId,
      telegramUsername: telegramUsername || null,
      needsNotificationSetup: computeNeedsNotificationSetup(
        updated as { email?: string | null; notificationPromptVersionSeen?: number }
      ),
    };

    let telegramWelcomeDelivered: boolean | undefined;
    let telegramWelcomeError: string | undefined;
    if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
      const welcome = await sendTelegramMessageWithOutcome({
        chatId: telegramUserId,
        text: `✅ ${appName}: your account is linked. Leave notifications will be sent here.`,
      });
      telegramWelcomeDelivered = welcome.ok;
      if (!welcome.ok) {
        telegramWelcomeError = welcome.description;
      }
    }

    return NextResponse.json({
      success: true,
      user: safe,
      /** Omitted if TELEGRAM_BOT_TOKEN unset; false if Telegram refused the DM (usually need Start in bot chat). */
      ...(telegramWelcomeDelivered !== undefined && { telegramWelcomeDelivered }),
      ...(telegramWelcomeError && { telegramWelcomeError }),
    });
  } catch (error) {
    logError('Telegram link error:', error);
    return internalServerError();
  }
}
