import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken } from '@/lib/auth';
import { RegisterMemberRequest, ShiftSchedule } from '@/types';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body: RegisterMemberRequest = await request.json();
    const { username, fullName, password, teamUsername, shiftSchedule } = body;

    if (!username || !fullName || !password || !teamUsername || !shiftSchedule) {
      return badRequestError('All fields are required');
    }

    // Check if username already exists
    const existingUser = await UserModel.findByUsername(username);
    if (existingUser) {
      return badRequestError('Username already exists');
    }

    // Find team by team username
    const team = await TeamModel.findByTeamUsername(teamUsername);
    if (!team) {
      return notFoundError('Team not found');
    }

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
      fullName: string;
      password: string;
      role: 'member';
      teamId: string;
      shiftSchedule: ShiftSchedule;
      workingDaysTag?: string;
    } = {
      username,
      fullName,
      password: hashedPassword,
      role: 'member',
      teamId: team._id,
      shiftSchedule: shiftScheduleCopy,
    };

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
      teamId: string;
    } = {
      id: user._id!,
      username: user.username,
      role: 'member',
      teamId: team._id,
    };

    const token = generateToken(tokenData);

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        teamId: team._id,
      },
      team: {
        id: team._id,
        name: team.name,
        teamUsername: team.teamUsername,
      },
    });
  } catch (error) {
    logError('Member registration error:', error);
    return internalServerError();
  }
}
