import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { error as logError, info } from '@/lib/logger';
import { internalServerError, badRequestError } from '@/lib/errors';
import { validateRequest, schemas } from '@/lib/validation';
import { apiRateLimit } from '@/lib/rateLimit';

interface ContactSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
  type: 'feedback' | 'bug' | 'feature' | 'other';
  userId?: string;
  username?: string;
  createdAt: Date;
}

/**
 * POST /api/contact
 * Submit a contact form message
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = apiRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const { name, email, subject, message, type, userId, username } = body;

    // Validate input using schema
    const validation = validateRequest(schemas.contact, { name, email, subject, message, type, userId, username });
    if (!validation.isValid) {
      return badRequestError('Validation failed', validation.errors);
    }

    const validatedData = validation.data;

    // Optional: Get user info if authenticated
    let authenticatedUser = null;
    const token = getTokenFromRequest(request);
    if (token) {
      authenticatedUser = verifyToken(token);
    }

    // Store contact submission in database
    const db = await getDatabase();
    const contacts = db.collection<ContactSubmission>('contacts');

    const submission: ContactSubmission = {
      name: validatedData.name.trim(),
      email: validatedData.email.trim(),
      subject: validatedData.subject.trim(),
      message: validatedData.message.trim(),
      type: validatedData.type,
      userId: authenticatedUser?.id || undefined,
      username: authenticatedUser?.username || undefined,
      createdAt: new Date(),
    };

    await contacts.insertOne(submission);

    info(`[Contact] New ${type} submission received`);

    // TODO: In production, you might want to send an email notification here
    // For now, we just store it in the database

    return NextResponse.json({
      message: 'Thank you for your feedback! We will get back to you soon.',
    });
  } catch (error) {
    logError('Contact submission error:', error);
    return internalServerError();
  }
}

