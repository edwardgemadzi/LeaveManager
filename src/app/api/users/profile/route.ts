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
import { shell, sendHtmlEmailWithOutcome } from '@/lib/mailer';
import { bestEffortSplitFullName } from '@/lib/nameParsing';

const PROMPT_VERSION = getNotificationPromptVersion();

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const db = await getDatabase();
    const users = db.collection('users');

    // Best-effort migration: derive first/middle/last from legacy fullName once.
    const existing = await users.findOne(
      { _id: new ObjectId(user.id) },
      { projection: { firstName: 1, middleName: 1, lastName: 1, fullName: 1 } }
    );
    const needsName =
      !existing?.firstName || !String(existing.firstName).trim() || !existing?.lastName || !String(existing.lastName).trim();
    const legacyFull = typeof existing?.fullName === 'string' ? existing.fullName.trim() : '';
    if (needsName && legacyFull) {
      const parsed = bestEffortSplitFullName(legacyFull);
      if (parsed) {
        await users.updateOne(
          { _id: new ObjectId(user.id) },
          {
            $set: {
              firstName: parsed.firstName,
              middleName: parsed.middleName,
              lastName: parsed.lastName,
            },
          }
        );
      }
    }

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
      firstName?: string;
      middleName?: string | null;
      lastName?: string;
      email?: string | null;
      timezone?: string | null;
      notifyEmail?: boolean;
      notifyTelegram?: boolean;
      dismissNotificationPrompt?: boolean;
      leaveReminderDaysBefore?: number[];
      leaderTeamLeaveReminderDays?: number[];
      leaveReminderTimeLocal?: string;
    };

    const db = await getDatabase();
    const users = db.collection('users');

    let previousEmailNormalized = '';
    if (data.email !== undefined) {
      const existing = await users.findOne(
        { _id: new ObjectId(user.id) },
        { projection: { email: 1 } }
      );
      previousEmailNormalized = String(existing?.email ?? '')
        .trim()
        .toLowerCase();
    }

    const $set: Record<string, unknown> = {};

    if (data.firstName !== undefined) {
      $set.firstName = data.firstName.trim();
    }

    if (data.middleName !== undefined) {
      const raw =
        data.middleName === null || data.middleName === ''
          ? ''
          : String(data.middleName).trim();
      $set.middleName = raw === '' ? null : raw;
    }

    if (data.lastName !== undefined) {
      $set.lastName = data.lastName.trim();
    }

    if (data.timezone !== undefined) {
      const raw =
        data.timezone === null || data.timezone === ''
          ? ''
          : String(data.timezone).trim();
      $set.timezone = raw === '' ? null : raw;
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

    const normalizeReminderDays = (arr: number[]) =>
      [...new Set(arr.filter((n) => Number.isInteger(n) && n >= 1 && n <= 90))].sort((a, b) => a - b);

    if (data.leaveReminderDaysBefore !== undefined) {
      $set.leaveReminderDaysBefore = normalizeReminderDays(data.leaveReminderDaysBefore);
    }

    if (
      user.role === 'leader' &&
      data.leaderTeamLeaveReminderDays !== undefined
    ) {
      $set.leaderTeamLeaveReminderDays = normalizeReminderDays(
        data.leaderTeamLeaveReminderDays
      );
    }

    if (data.leaveReminderTimeLocal !== undefined) {
      $set.leaveReminderTimeLocal = String(data.leaveReminderTimeLocal).trim();
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

    let emailConfirmationSent: boolean | undefined;
    let emailConfirmationError: string | undefined;
    if (data.email !== undefined) {
      const raw =
        data.email === null || data.email === '' ? '' : String(data.email).trim();
      if (raw !== '') {
        const nextNorm = raw.toLowerCase();
        if (nextNorm !== previousEmailNormalized) {
          const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
          const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">This address is now saved on your profile. Leave-related updates will be sent here when email notifications are enabled.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">If you did not add this email, sign in and remove it from your profile.</p>`;
          const sent = await sendHtmlEmailWithOutcome({
            to: raw,
            subject: `${appName}: email saved`,
            html: shell(inner, {
              title: 'Email saved',
              preheader: 'Your notification address was updated',
            }),
          });
          emailConfirmationSent = sent.ok;
          if (!sent.ok) {
            emailConfirmationError = sent.error;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: safeUserData,
      message: 'Profile updated successfully',
      ...(emailConfirmationSent !== undefined && { emailConfirmationSent }),
      ...(emailConfirmationError && { emailConfirmationError }),
    });
  } catch (error) {
    logError('Update profile error:', error);
    return internalServerError();
  }
}
