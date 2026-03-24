import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb';
import { shouldRejectCsrf } from '@/lib/auth';
import { requireAuth } from '@/lib/api-helpers';
import { apiRateLimit } from '@/lib/rateLimit';
import { shell, sendHtmlEmailWithOutcome } from '@/lib/mailer';
import { internalServerError } from '@/lib/errors';
import { error as logError } from '@/lib/logger';

/**
 * POST /api/users/profile/test-email
 * Send a one-off test message to the user's saved profile email (Gmail SMTP).
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
    const doc = await users.findOne({ _id: new ObjectId(auth.id) }, { projection: { email: 1 } });
    const to = String(doc?.email ?? '').trim();
    if (!to) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'NO_EMAIL',
          message: 'Save an email address on your profile first.',
        },
        { status: 400 }
      );
    }

    const appName = process.env.APP_NAME?.trim() || 'Leave Manager';
    const inner = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155;">If you are reading this, Gmail SMTP from your deployment is working.</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;">You can ignore this message.</p>`;
    const sent = await sendHtmlEmailWithOutcome({
      to,
      subject: `${appName}: test email`,
      html: shell(inner, {
        title: 'Test email',
        preheader: 'Delivery check',
      }),
    });

    if (!sent.ok) {
      return NextResponse.json(
        {
          ok: false,
          delivered: false,
          reason: 'SEND_FAILED',
          message:
            'Could not send email. On Vercel, set GMAIL_USER and GMAIL_APP_PASSWORD for Production. Use a Google App Password, not your normal password.',
          smtpError: sent.error,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      delivered: true,
      message: `Test email sent to ${to}. Check inbox and spam.`,
    });
  } catch (error) {
    logError('Profile test email error:', error);
    return internalServerError();
  }
}
