import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';
import { requireAuth, requireSafeUserData } from '@/lib/api-helpers';
import { validateRequest, schemas } from '@/lib/validation';
import {
  computeNeedsNotificationSetup,
  getNotificationPromptVersion,
} from '@/lib/notificationPrompt';

const PROMPT_VERSION = getNotificationPromptVersion();

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const userDataResult = await requireSafeUserData(user.id, 'User not found');
    if (userDataResult instanceof NextResponse) {
      return userDataResult;
    }

    const normalizedUser = {
      ...userDataResult,
      id: (userDataResult as { _id?: string })._id || (userDataResult as { id?: string }).id,
      needsNotificationSetup: computeNeedsNotificationSetup(
        userDataResult as { email?: string | null; notificationPromptVersionSeen?: number }
      ),
    };
    return NextResponse.json({ user: normalizedUser });
  } catch (error) {
    logError('Get profile error:', error);
    return internalServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const body = await request.json();
    const validation = validateRequest(schemas.updateProfile, body);
    if (!validation.isValid) {
      return badRequestError('Validation failed', validation.errors);
    }

    const data = validation.data as {
      fullName?: string;
      email?: string | null;
      notifyEmail?: boolean;
      notifyTelegram?: boolean;
      dismissNotificationPrompt?: boolean;
    };

    const db = await getDatabase();
    const users = db.collection('users');

    const $set: Record<string, unknown> = {};

    if (data.fullName !== undefined) {
      $set.fullName = data.fullName.trim();
    }

    if (data.email !== undefined) {
      const raw = data.email === null || data.email === '' ? '' : String(data.email).trim();
      if (raw === '') {
        $set.email = null;
        $set.emailNormalized = null;
      } else {
        $set.email = raw;
        $set.emailNormalized = raw.toLowerCase();
        $set.notificationPromptVersionSeen = PROMPT_VERSION;
      }
      if (data.notifyEmail === undefined && raw !== '') {
        $set.notifyEmail = true;
      }
    }

    if (data.notifyEmail !== undefined) {
      $set.notifyEmail = data.notifyEmail;
    }

    if (data.notifyTelegram !== undefined) {
      $set.notifyTelegram = data.notifyTelegram;
    }

    if (data.dismissNotificationPrompt === true) {
      $set.notificationPromptVersionSeen = PROMPT_VERSION;
    }

    if (Object.keys($set).length === 0) {
      return badRequestError('No valid fields to update');
    }

    const result = await users.updateOne({ _id: new ObjectId(user.id) }, { $set });

    if (result.matchedCount === 0) {
      return notFoundError('User not found');
    }

    const updatedUserResult = await requireSafeUserData(user.id, 'User not found');
    if (updatedUserResult instanceof NextResponse) {
      return updatedUserResult;
    }
    const safeUserData = {
      ...updatedUserResult,
      id: (updatedUserResult as { _id?: string })._id || (updatedUserResult as { id?: string }).id,
      needsNotificationSetup: computeNeedsNotificationSetup(
        updatedUserResult as { email?: string | null; notificationPromptVersionSeen?: number }
      ),
    };

    return NextResponse.json({
      success: true,
      user: safeUserData,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    logError('Update profile error:', error);
    return internalServerError();
  }
}
