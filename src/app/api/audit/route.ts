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
    const requestedLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 100;
    const userId = searchParams.get('userId');

    if (!user.teamId) {
      return forbiddenError('Leader must be assigned to a team');
    }

    let auditLogs;
    if (userId) {
      // Get logs for a specific user scoped to caller team
      auditLogs = await AuditLogModel.findByUserIdInTeam(userId, user.teamId, limit);
    } else {
      // Get logs for the entire team
      auditLogs = await AuditLogModel.findByTeamId(user.teamId, limit);
    }

    return NextResponse.json({ auditLogs });
  } catch (error) {
    logError('Get audit logs error:', error);
    return internalServerError();
  }
}
