import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { RegisterLeaderRequest } from '@/types';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const body: RegisterLeaderRequest = await request.json();
    const { username, fullName, password, teamName, teamUsername } = body;

    if (!username || !fullName || !password || !teamName || !teamUsername) {
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

    // Check if team username already exists
    const existingTeam = await TeamModel.findByTeamUsername(teamUsername);
    if (existingTeam) {
      return NextResponse.json(
        { error: 'Team username already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create team first
    const team = await TeamModel.create({
      name: teamName,
      teamUsername,
      leaderId: '', // Will be updated after user creation
      settings: {
        concurrentLeave: 2,
        maxLeavePerYear: 20,
        minimumNoticePeriod: 1,
      },
    });

    if (!team._id) {
      return NextResponse.json(
        { error: 'Failed to create team' },
        { status: 500 }
      );
    }

    // Create user
    const user = await UserModel.create({
      username,
      fullName,
      password: hashedPassword,
      role: 'leader',
      teamId: team._id,
    });

    // Update team with leader ID
    const db = await getDatabase();
    const teams = db.collection('teams');
    await teams.updateOne(
      { _id: new ObjectId(team._id) },
      { $set: { leaderId: user._id } }
    );

    // Build token data
    const tokenData: {
      id: string;
      username: string;
      role: 'leader';
      teamId: string;
    } = {
      id: user._id!,
      username: user.username,
      role: 'leader',
      teamId: team._id!,
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
    console.error('Leader registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
