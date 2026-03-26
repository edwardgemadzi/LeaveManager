import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { unauthorizedError, forbiddenError, internalServerError } from '@/lib/errors';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { AuditLogModel } from '@/models/AuditLog';

/** Reduce CSV formula-injection risk when opened in Excel/Sheets. */
function csvQuotedField(value: string): string {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  // Guard also when there is leading whitespace before the formula character.
  const needsFormulaGuard = /^[\s]*[=+\-@]/.test(raw);
  const safeInner = needsFormulaGuard ? `'${escaped}` : escaped;
  return `"${safeInner}"`;
}

export async function GET(request: NextRequest) {
  try {
    const fromParam = request.nextUrl.searchParams.get('from');
    const toParam = request.nextUrl.searchParams.get('to');
    const format = request.nextUrl.searchParams.get('format') || 'json';
    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(toParam) : null;

    const token = getTokenFromRequest(request);
    if (!token) return unauthorizedError();
    const user = verifyToken(token);
    if (!user?.teamId) return unauthorizedError('Invalid token');
    if (user.role !== 'leader') return forbiddenError();

    const [team, members, requests, auditLogs] = await Promise.all([
      TeamModel.findById(user.teamId),
      UserModel.findByTeamId(user.teamId),
      LeaveRequestModel.findByTeamId(user.teamId),
      AuditLogModel.findByTeamId(user.teamId, 10000),
    ]);

    const filteredRequests = requests.filter((r) => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      if (fromDate && !Number.isNaN(fromDate.getTime()) && end < fromDate) return false;
      if (toDate && !Number.isNaN(toDate.getTime()) && start > toDate) return false;
      return true;
    });
    const memberById = new Map(members.map((m) => [String(m._id), m]));

    const payload = {
      generatedAt: new Date().toISOString(),
      range: {
        from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString().split('T')[0] : null,
        to: toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString().split('T')[0] : null,
      },
      team,
      summary: {
        totalMembers: members.length,
        totalRequests: filteredRequests.length,
        approvedRequests: filteredRequests.filter((r) => r.status === 'approved').length,
        pendingRequests: filteredRequests.filter((r) => r.status === 'pending').length,
        rejectedRequests: filteredRequests.filter((r) => r.status === 'rejected').length,
        totalAuditLogs: auditLogs.length,
      },
      audit: auditLogs,
      payroll: filteredRequests.map((r) => ({
        requestId: r._id,
        userId: r.userId,
        username: memberById.get(String(r.userId))?.username || '',
        fullName: memberById.get(String(r.userId))?.fullName || '',
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
        reason: r.reason,
        decisionAt: r.decisionAt,
        decisionBy: r.decisionByUsername,
      })),
      balances: members.map((m) => ({
        userId: m._id,
        username: m.username,
        manualLeaveBalance: m.manualLeaveBalance,
        manualYearToDateUsed: m.manualYearToDateUsed,
        carryoverFromPreviousYear: m.carryoverFromPreviousYear,
        role: m.role,
        accessRole: m.accessRole,
      })),
    };

    if (format === 'csv') {
      const csvRows = [
        ['requestId', 'userId', 'username', 'fullName', 'startDate', 'endDate', 'status', 'reason', 'decisionAt', 'decisionBy'].join(','),
        ...payload.payroll.map((row) =>
          [
            csvQuotedField(String(row.requestId || '')),
            csvQuotedField(String(row.userId || '')),
            csvQuotedField(String(row.username || '')),
            csvQuotedField(String(row.fullName || '')),
            csvQuotedField(row.startDate ? new Date(row.startDate).toISOString().split('T')[0] : ''),
            csvQuotedField(row.endDate ? new Date(row.endDate).toISOString().split('T')[0] : ''),
            csvQuotedField(String(row.status || '')),
            csvQuotedField(String(row.reason || '')),
            csvQuotedField(row.decisionAt ? new Date(row.decisionAt).toISOString() : ''),
            csvQuotedField(String(row.decisionBy || '')),
          ].join(',')
        ),
      ].join('\n');
      return new NextResponse(csvRows, {
        status: 200,
        headers: {
          ...NO_STORE_JSON_HEADERS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export-pack-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json(payload, { headers: NO_STORE_JSON_HEADERS });
  } catch {
    return internalServerError();
  }
}

