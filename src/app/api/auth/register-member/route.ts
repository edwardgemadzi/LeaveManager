import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken, setAuthCookie } from '@/lib/auth';
import { RegisterMemberRequest, ShiftSchedule } from '@/types';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';
import { validateRequest, schemas } from '@/lib/validation';
import { authRateLimit } from '@/lib/rateLimit';
import { resolveUserTimeZone } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = process.env.NODE_ENV !== 'test' ? await authRateLimit(request) : null;
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body: RegisterMemberRequest = await request.json();
    const validation = validateRequest(schemas.registerMember, body);
    if (!validation.isValid) {
      return badRequestError('Invalid input', validation.errors);
    }

    const username = validation.data.username.toLowerCase();
    const teamUsername = validation.data.teamUsername.toLowerCase();
    const { firstName, middleName, lastName, password, shiftSchedule, email, timezone } = validation.data as unknown as {
      firstName: string;
      middleName?: string | null;
      lastName: string;
      password: string;
      shiftSchedule: ShiftSchedule;
      email?: string | null;
      timezone?: string | null;
    };
    const { maternityPaternityType } = body;

    if (!username || !firstName || !lastName || !password || !teamUsername || !shiftSchedule) {
      return badRequestError('All fields are required');
    }

    // Check if username already exists
    const existingUser = await UserModel.findByUsername(username);
    if (existingUser) {
      return badRequestError('Username already exists');
    }
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    if (normalizedEmail) {
      const existingEmailUser = await UserModel.findByEmail(normalizedEmail);
      if (existingEmailUser) {
        return badRequestError('Email already exists');
      }
    }

    // Find team by team username
    const team = await TeamModel.findByTeamUsername(teamUsername);
    if (!team) {
      return notFoundError('Team not found');
    }
    const leader = team.leaderId ? await UserModel.findById(team.leaderId) : null;
    const normalizedTimezone = resolveUserTimeZone(timezone || leader?.timezone || undefined);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Only store tag for fixed schedules (tags are stable)
    // For rotating schedules, tags change daily and should be regenerated
    if (!team._id) {
      return internalServerError('Team ID not found');
    }

    // Ensure shiftSchedule.startDate is a Date object (might come as string from JSON)
    // Create a copy of shiftSchedule to avoid mutating the original
    let startDate: Date;
    if (shiftSchedule.startDate) {
      if (typeof shiftSchedule.startDate === 'string') {
        startDate = new Date(shiftSchedule.startDate);
      } else if (shiftSchedule.startDate instanceof Date) {
        startDate = new Date(shiftSchedule.startDate);
      } else {
        startDate = new Date();
      }
      
      // Validate that startDate is a valid date
      if (isNaN(startDate.getTime())) {
        return badRequestError('Invalid start date in shift schedule');
      }
    } else {
      startDate = new Date();
    }

    const shiftScheduleCopy: ShiftSchedule = {
      ...shiftSchedule,
      startDate,
    };

    const userData: {
      username: string;
      firstName: string;
      middleName?: string | null;
      lastName: string;
      password: string;
      role: 'member';
      teamId: string;
      shiftSchedule: ShiftSchedule;
      workingDaysTag?: string;
      maternityPaternityType?: 'maternity' | 'paternity' | null;
      email?: string;
      timezone?: string;
      accessRole?: 'leader' | 'member' | 'approver' | 'hr_admin' | 'viewer';
    } = {
      username,
      firstName,
      ...(middleName !== undefined ? { middleName: middleName === '' ? null : middleName } : {}),
      lastName,
      password: hashedPassword,
      role: 'member',
      accessRole: 'member',
      teamId: team._id,
      shiftSchedule: shiftScheduleCopy,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      timezone: normalizedTimezone,
    };

    // Add maternityPaternityType if provided
    if (maternityPaternityType !== undefined && maternityPaternityType !== null) {
      if (maternityPaternityType === 'maternity' || maternityPaternityType === 'paternity') {
        userData.maternityPaternityType = maternityPaternityType;
      }
    }

    // Only store tag for fixed schedules
    if (shiftSchedule.type === 'fixed') {
      try {
        userData.workingDaysTag = generateWorkingDaysTag(shiftScheduleCopy);
      } catch (error) {
        logError('Error generating working days tag:', error);
        // Continue without tag rather than failing registration
      }
    }

    // Create user
    const user = await UserModel.create(userData);

    // Build token data
    const tokenData: {
      id: string;
      username: string;
      role: 'member';
      accessRole?: 'leader' | 'member' | 'approver' | 'hr_admin' | 'viewer';
      teamId: string;
    } = {
      id: user._id!,
      username: user.username,
      role: 'member',
      accessRole: user.accessRole || 'member',
      teamId: team._id,
    };

    const token = generateToken(tokenData);

    const response = NextResponse.json({
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        accessRole: user.accessRole || user.role,
        teamId: team._id,
        timezone: user.timezone || normalizedTimezone,
      },
      team: {
        id: team._id,
        name: team.name,
        teamUsername: team.teamUsername,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    logError('Member registration error:', error);
    return internalServerError();
  }
}
