import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { AuditLogModel } from '@/models/AuditLog';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Only leaders can view audit logs
    if (user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    console.error('Get audit logs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
