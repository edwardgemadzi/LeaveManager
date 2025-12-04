import { NextRequest, NextResponse } from 'next/server';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import bcrypt from 'bcrypt';
import { emergencyRateLimit } from '@/lib/rateLimit';
import { validateRequest, schemas } from '@/lib/validation';
import { teamIdsMatch } from '@/lib/helpers';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError, unauthorizedError, forbiddenError } from '@/lib/errors';
import { requireLeader } from '@/lib/api-helpers';
import { parseDateSafe } from '@/lib/dateUtils';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for emergency requests
    const rateLimitResponse = emergencyRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Require leader authentication
    const authResult = requireLeader(request, 'Leaders only');
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    const body = await request.json();
    
    // Validate input
    const validation = validateRequest(schemas.emergencyRequest, body);
    if (!validation.isValid) {
      return badRequestError('Invalid input', validation.errors);
    }

    const { memberId, startDate, endDate, reason, password } = validation.data;

    // Verify the leader's password
    const leader = await UserModel.findById(user.id);
    if (!leader) {
      return notFoundError('Leader not found');
    }

    const isPasswordValid = await bcrypt.compare(password, leader.password);
    if (!isPasswordValid) {
      return unauthorizedError('Invalid password');
    }

    // Verify the member exists and belongs to the same team
    const member = await UserModel.findById(memberId);
    if (!member) {
      return notFoundError('Member not found');
    }

    // Compare teamIds using consistent helper
    if (!teamIdsMatch(member.teamId, user.teamId)) {
      return forbiddenError('Member does not belong to your team');
    }

    // Validate dates - parse safely to avoid timezone shifts
    const start = parseDateSafe(startDate);
    const end = parseDateSafe(endDate);
    
    if (start > end) {
      return badRequestError('Start date must be before end date');
    }

    // Create the emergency leave request (automatically approved)
    const emergencyRequest = await LeaveRequestModel.create({
      userId: memberId,
      teamId: user.teamId!,
      startDate: start,
      endDate: end,
      reason: reason,
      status: 'approved', // Emergency requests are auto-approved
      requestedBy: user.id, // Track that this was requested by the leader
    });

    // Return the created request
    return NextResponse.json({
      _id: emergencyRequest._id,
      userId: emergencyRequest.userId,
      teamId: emergencyRequest.teamId,
      startDate: emergencyRequest.startDate,
      endDate: emergencyRequest.endDate,
      reason: emergencyRequest.reason,
      status: emergencyRequest.status,
      requestedBy: emergencyRequest.requestedBy,
      createdAt: emergencyRequest.createdAt,
      updatedAt: emergencyRequest.updatedAt,
    });

  } catch (error) {
    logError('Emergency request error:', error);
    return internalServerError();
  }
}
