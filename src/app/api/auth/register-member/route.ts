import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken } from '@/lib/auth';
import { RegisterMemberRequest } from '@/types';

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

    // Create user
    const user = await UserModel.create({
      username,
      fullName,
      password: hashedPassword,
      role: 'member',
      teamId: team._id,
      shiftSchedule,
    });

    const token = generateToken({
      id: user._id!,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
    });

    return NextResponse.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        teamId: user.teamId,
      },
      team: {
        id: team._id,
        name: team.name,
        teamUsername: team.teamUsername,
      },
    });
  } catch (error) {
    console.error('Member registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
