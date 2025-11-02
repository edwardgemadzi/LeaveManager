import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken } from '@/lib/auth';
import { RegisterMemberRequest, ShiftSchedule } from '@/types';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';

export async function POST(request: NextRequest) {
  try {
    const body: RegisterMemberRequest = await request.json();
    const { username, fullName, password, teamUsername, shiftSchedule } = body;

    if (!username || !fullName || !password || !teamUsername || !shiftSchedule) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existingUser = await UserModel.findByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }

    // Find team by team username
    const team = await TeamModel.findByTeamUsername(teamUsername);
    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Only store tag for fixed schedules (tags are stable)
    // For rotating schedules, tags change daily and should be regenerated
    if (!team._id) {
      return NextResponse.json(
        { error: 'Team ID not found' },
        { status: 500 }
      );
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
        return NextResponse.json(
          { error: 'Invalid start date in shift schedule' },
          { status: 400 }
        );
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
        console.error('Error generating working days tag:', error);
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
    console.error('Member registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}
