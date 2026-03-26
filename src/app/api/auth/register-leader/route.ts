import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { generateToken, setAuthCookie } from '@/lib/auth';
import { getClient, getDatabaseRaw } from '@/lib/mongodb';
import { RegisterLeaderRequest } from '@/types';
import { MongoServerError, ObjectId } from 'mongodb';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError } from '@/lib/errors';
import { validateRequest, schemas } from '@/lib/validation';
import { authRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = process.env.NODE_ENV !== 'test' ? authRateLimit(request) : null;
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body: RegisterLeaderRequest = await request.json();
    const validation = validateRequest(schemas.registerLeader, body);
    if (!validation.isValid) {
      return badRequestError('Invalid input', validation.errors);
    }

    const username = validation.data.username.toLowerCase();
    const teamUsername = validation.data.teamUsername.toLowerCase();
    const { firstName, middleName, lastName, password, teamName, email } = validation.data as unknown as {
      firstName: string;
      middleName?: string | null;
      lastName: string;
      password: string;
      teamName: string;
      email?: string | null;
    };

    if (!username || !firstName || !lastName || !password || !teamName || !teamUsername) {
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

    // Check if team username already exists
    const existingTeam = await TeamModel.findByTeamUsername(teamUsername);
    if (existingTeam) {
      return badRequestError('Team username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const client = await getClient();
    const session = client.startSession();
    let transactionResult: { teamId: string; userId: string; username: string; role: 'leader'; teamName: string; teamUsername: string } | null = null;

    try {
      transactionResult = await session.withTransaction(async () => {
        const team = await TeamModel.create(
          {
            name: teamName,
            teamUsername,
            leaderId: '', // Will be updated after user creation
            settings: {
              concurrentLeave: 2,
              maxLeavePerYear: 20,
              minimumNoticePeriod: 1,
              allowMemberHistoricalSubmissions: false,
              historicalSubmissionLookbackDays: 365,
            },
          },
          session
        );

        if (!team._id) {
          throw new Error('Failed to create team');
        }

        const user = await UserModel.create(
          {
            username,
            firstName,
            ...(middleName !== undefined ? { middleName: middleName === '' ? null : middleName } : {}),
            lastName,
            password: hashedPassword,
            role: 'leader',
            teamId: team._id,
            ...(normalizedEmail ? { email: normalizedEmail } : {}),
          },
          session
        );

        if (!user._id) {
          throw new Error('Failed to create user');
        }

        // Validate ObjectId format before updating team
        if (!team._id || !ObjectId.isValid(team._id)) {
          throw new Error('Invalid team ID format');
        }

        const db = await getDatabaseRaw();
        const teams = db.collection('teams');
        const updateResult = await teams.updateOne(
          { _id: new ObjectId(team._id) },
          { $set: { leaderId: user._id } },
          { session }
        );
        if (updateResult.matchedCount !== 1) {
          throw new Error('Failed to assign team leader');
        }

        return {
          teamId: team._id,
          userId: user._id,
          username: user.username,
          role: 'leader' as const,
          teamName: team.name,
          teamUsername: team.teamUsername,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!transactionResult?.teamId) {
      return internalServerError('Failed to create team');
    }

    if (!transactionResult.userId) {
      return internalServerError();
    }

    // Build token data
    const tokenData: {
      id: string;
      username: string;
      role: 'leader';
      teamId: string;
    } = {
      id: transactionResult.userId,
      username: transactionResult.username,
      role: 'leader',
      teamId: transactionResult.teamId,
    };

    const token = generateToken(tokenData);

    const response = NextResponse.json({
      user: {
        id: transactionResult.userId,
        username: transactionResult.username,
        role: transactionResult.role,
        teamId: transactionResult.teamId,
      },
      team: {
        id: transactionResult.teamId,
        name: transactionResult.teamName,
        teamUsername: transactionResult.teamUsername,
      },
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || '';
      if (duplicateField === 'username') {
        return badRequestError('Username already exists');
      }
      if (duplicateField === 'teamUsername') {
        return badRequestError('Team username already exists');
      }
      return badRequestError('Duplicate value already exists');
    }
    logError('Leader registration error:', error);
    return internalServerError();
  }
}
