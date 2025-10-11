import { NextRequest, NextResponse } from 'next/server';
import { UserModel } from '@/models/User';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { emailService } from '@/lib/email';

// Store reset tokens temporarily (in production, use Redis or database)
const resetTokens = new Map<string, { userId: string; expires: number }>();

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Find user by username
    const user = await UserModel.findByUsername(username);
    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        message: 'If the username exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Store token temporarily
    resetTokens.set(resetToken, { userId: user._id!, expires });

    // In a real application, you would send an email here
    // For now, we'll return the token in development mode
    const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    console.log('Password reset requested for:', username);
    console.log('Reset URL:', resetUrl);
    console.log('Token expires at:', new Date(expires).toISOString());

    // Send email with reset link (placeholder implementation)
    // In production, you would use the user's actual email address
    const userEmail = `${user.username}@example.com`; // Placeholder email
    try {
      await emailService.sendPasswordResetNotification(
        userEmail,
        user.username,
        resetUrl
      );
      console.log('Password reset email sent to:', userEmail);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Continue anyway - the reset URL is still valid
    }

    return NextResponse.json({
      message: 'If the username exists, a password reset link has been sent.',
      // Only include resetUrl in development
      ...(process.env.NODE_ENV === 'development' && { resetUrl })
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to validate reset token
export function validateResetToken(token: string): { userId: string } | null {
  const tokenData = resetTokens.get(token);
  
  if (!tokenData) {
    return null;
  }

  if (Date.now() > tokenData.expires) {
    resetTokens.delete(token);
    return null;
  }

  return { userId: tokenData.userId };
}

// Helper function to consume reset token
export function consumeResetToken(token: string): { userId: string } | null {
  const result = validateResetToken(token);
  if (result) {
    resetTokens.delete(token);
  }
  return result;
}
