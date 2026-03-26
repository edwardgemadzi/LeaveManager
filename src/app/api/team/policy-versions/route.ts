import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, shouldRejectCsrf, verifyToken } from '@/lib/auth';
import { unauthorizedError, forbiddenError, badRequestError, internalServerError } from '@/lib/errors';
import { TeamPolicyVersionModel } from '@/models/TeamPolicyVersion';
import { NO_STORE_JSON_HEADERS } from '@/lib/securityHeaders';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return unauthorizedError();
    const user = verifyToken(token);
    if (!user?.teamId) return unauthorizedError('Invalid token');
    const versions = await TeamPolicyVersionModel.list(user.teamId);
    return NextResponse.json({ versions }, { headers: NO_STORE_JSON_HEADERS });
  } catch {
    return internalServerError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (shouldRejectCsrf(request)) return forbiddenError('Invalid request origin');

    const token = getTokenFromRequest(request);
    if (!token) return unauthorizedError();
    const user = verifyToken(token);
    if (!user?.teamId) return unauthorizedError('Invalid token');
    if (user.role !== 'leader') return forbiddenError();

    const body = (await request.json()) as {
      effectiveFrom?: string;
      settings?: Record<string, unknown>;
      versionLabel?: string;
    };
    if (!body.effectiveFrom || !body.settings) {
      return badRequestError('effectiveFrom and settings are required');
    }
    const effectiveFrom = new Date(body.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      return badRequestError('Invalid effectiveFrom');
    }

    const created = await TeamPolicyVersionModel.create({
      teamId: user.teamId,
      effectiveFrom,
      settings: body.settings as never,
      createdBy: user.id,
      versionLabel: body.versionLabel,
    });
    return NextResponse.json({ version: created }, { headers: NO_STORE_JSON_HEADERS });
  } catch (error) {
    if (error instanceof SyntaxError) return badRequestError('Invalid request body');
    return internalServerError();
  }
}

