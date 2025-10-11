import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { getDatabase } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    console.log('Team API - Token:', token ? 'Present' : 'Missing');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    console.log('Team API - User:', user);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log('Team API - Looking for teamId:', user.teamId);
    console.log('Team API - TeamId type:', typeof user.teamId);
    
    const team = await TeamModel.findById(user.teamId!);
    console.log('Team API - Found team:', team);
    
    if (!team) {
      console.log('Team API - Team not found, checking all teams...');
      const db = await getDatabase();
      const allTeams = await db.collection('teams').find({}).toArray();
      console.log('Team API - All teams in database:', allTeams);
    }
    
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const members = await UserModel.findByTeamId(user.teamId!);
    
    // Get current user data with shift schedule
    const currentUser = await UserModel.findById(user.id);

    // Use members as-is, no need to add current user separately
    const allMembers = members;

    const response = {
      team,
      currentUser: currentUser ? {
        _id: currentUser._id,
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role,
        shiftSchedule: currentUser.shiftSchedule,
      } : null,
      members: allMembers.map(member => ({
        _id: member._id,
        username: member.username,
        fullName: member.fullName,
        role: member.role,
        shiftSchedule: member.shiftSchedule,
      })),
    };
    
    console.log('Team API - Returning data:', {
      teamId: team._id,
      currentUserId: user.id,
      membersCount: response.members.length,
      members: response.members.map(m => ({ _id: m._id, username: m.username, fullName: m.fullName }))
    });
    
    console.log('Team API - Member inclusion check:', {
      allMembersCount: allMembers.length,
      originalMembersCount: members.length,
      currentUserIncluded: !!currentUser,
      currentUserId: currentUser?._id,
      currentUserInOriginalMembers: !!members.find(m => m._id === currentUser?._id)
    });
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Get team error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== 'leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { settings } = await request.json();
    
    if (!settings || 
        typeof settings.concurrentLeave !== 'number' || 
        typeof settings.maxLeavePerYear !== 'number' ||
        typeof settings.minimumNoticePeriod !== 'number') {
      return NextResponse.json(
        { error: 'Invalid settings' },
        { status: 400 }
      );
    }

    await TeamModel.updateSettings(user.teamId!, settings);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update team settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
