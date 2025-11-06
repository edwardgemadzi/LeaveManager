import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { AuditLogModel } from '@/models/AuditLog';
import { error as logError } from '@/lib/logger';
import { internalServerError, unauthorizedError, forbiddenError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedError();
    }

    const user = verifyToken(token);
    if (!user) {
      return unauthorizedError('Invalid token');
    }

    // Only leaders can view audit logs
    if (user.role !== 'leader') {
      return forbiddenError();
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const userId = searchParams.get('userId');

    let auditLogs;
    if (userId) {
      // Get logs for a specific user
      auditLogs = await AuditLogModel.findByUserId(userId, limit);
    } else {
      // Get logs for the entire team
      auditLogs = await AuditLogModel.findByTeamId(user.teamId!, limit);
    }

    return NextResponse.json({ auditLogs });
  } catch (error) {
    logError('Get audit logs error:', error);
    return internalServerError();
  }
}
