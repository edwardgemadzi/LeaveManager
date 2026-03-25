import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb';
import { shouldRejectCsrf } from '@/lib/auth';
import { requireAuth, requireSafeUserData } from '@/lib/api-helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import { internalServerError, notFoundError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';
import { computeNeedsNotificationSetup } from '@/lib/notificationPrompt';
import { TelegramLinkTokenModel } from '@/models/TelegramLinkToken';

/**
 * POST /api/users/telegram/unlink
 * Clear linked Telegram account so the user can generate a new deep link.
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

    const db = await getDatabase();
    const users = db.collection('users');

    const result = await users.updateOne(
      { _id: new ObjectId(user.id) },
      {
        $set: {
          telegramUserId: null,
          telegramUsername: null,
        },
      }
    );

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    await TelegramLinkTokenModel.deleteManyForUser(new ObjectId(user.id));

    const updated = await requireSafeUserData(user.id, 'User not found');
    if (updated instanceof NextResponse) {
      return updated;
    }

    const safe = {
      ...updated,
      id: (updated as { _id?: string })._id,
      telegramUserId: null as null,
      telegramUsername: null as null,
      needsNotificationSetup: computeNeedsNotificationSetup(
        updated as { email?: string | null; notificationPromptVersionSeen?: number }
      ),
    };

    return NextResponse.json({
      success: true,
      user: safe,
      message: 'Telegram disconnected. You can link again from your profile.',
    });
  } catch (error) {
    logError('Telegram unlink error:', error);
    return internalServerError();
  }
}
