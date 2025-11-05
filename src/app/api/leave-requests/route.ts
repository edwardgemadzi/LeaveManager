import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { CreateLeaveRequest } from '@/types';
import { isBypassNoticePeriodActive } from '@/lib/analyticsCalculations';
import { validateRequest, schemas } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    // Get team settings to check if subgrouping is enabled
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Fetch all leave requests for the team
    let requests = await LeaveRequestModel.findByTeamId(user.teamId);

    // If user is a member and subgrouping is enabled, filter by subgroup
    if (user.role === 'member' && team.settings.enableSubgrouping) {
      const currentUser = await UserModel.findById(user.id);
      const userSubgroup = currentUser?.subgroupTag || 'Ungrouped';
      
      // Fetch all users in the team ONCE instead of N queries
      const teamMembers = await UserModel.findByTeamId(user.teamId);
      
      // Create a map of userId -> subgroupTag for O(1) lookup
      // Normalize IDs to strings to ensure matching
      const userSubgroupMap = new Map<string, string>();
      teamMembers.forEach(member => {
        if (member._id) {
          const memberId = String(member._id).trim();
          const memberSubgroup = member.subgroupTag || 'Ungrouped';
          userSubgroupMap.set(memberId, memberSubgroup);
        }
      });
      
      // Filter requests using the map (no database queries)
      const filteredRequests = requests.filter(req => {
        const reqUserId = String(req.userId).trim();
        const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
        return reqUserSubgroup === userSubgroup;
      });
      requests = filteredRequests;
    }
    // Leaders see all requests (no filtering needed)

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Get leave requests error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body: CreateLeaveRequest = await request.json();
    const { startDate, endDate, reason, requestedFor, isHistorical } = body;

    // Validate input using schema (skip for historical requests)
    if (!isHistorical) {
      const validation = validateRequest(schemas.leaveRequest, { startDate, endDate, reason });
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.errors },
          { status: 400 }
        );
      }
    } else {
      // Basic validation for historical requests
      if (!startDate || !endDate || !reason) {
        return NextResponse.json(
          { error: 'Start date, end date, and reason are required' },
          { status: 400 }
        );
      }
    }

    // Only leaders can create historical requests (for migration)
    if (isHistorical && user.role !== 'leader') {
      return NextResponse.json(
        { error: 'Only leaders can create historical leave entries' },
        { status: 403 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return NextResponse.json(
        { error: 'End date must be on or after start date' },
        { status: 400 }
      );
    }

    // Determine the user ID for the request
    const requestUserId = requestedFor || user.id;

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    // Get team settings for validation
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check minimum notice period (skip for historical requests)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    const requestStartDate = new Date(start);
    requestStartDate.setHours(0, 0, 0, 0); // Reset time to start of day
    
    const daysDifference = Math.ceil((requestStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Skip notice period validation for historical requests (migration)
    if (!isHistorical) {
      const bypassActive = isBypassNoticePeriodActive(team, today);
      
      if (!bypassActive && daysDifference < team.settings.minimumNoticePeriod) {
        return NextResponse.json(
          { 
            error: `Leave requests must be submitted at least ${team.settings.minimumNoticePeriod} day(s) in advance. Please select a start date ${team.settings.minimumNoticePeriod} or more days from today.` 
          },
          { status: 400 }
        );
      }
    }

    // Check concurrent leave limit (skip for all historical requests)
    // Historical requests are for migration purposes and should not be restricted
    // Skip concurrent leave validation for all historical requests, regardless of date
    if (!isHistorical) {
      const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
        user.teamId!,
        start,
        end
      );

      // Get the requesting user's shift tag and subgroup tag
      const requestingUser = await UserModel.findById(requestUserId);
      const requestingUserShiftTag = requestingUser?.shiftTag;
      const requestingUserSubgroupTag = requestingUser?.subgroupTag;

      // Fetch all team members ONCE to avoid N+1 queries
      const teamMembers = await UserModel.findByTeamId(user.teamId);
      
      // Create maps for O(1) lookups
      const userSubgroupMap = new Map<string, string>();
      const userShiftTagMap = new Map<string, string | undefined>();
      teamMembers.forEach(member => {
        if (member._id) {
          userSubgroupMap.set(member._id, member.subgroupTag || 'Ungrouped');
          userShiftTagMap.set(member._id, member.shiftTag);
        }
      });
      
      // Ensure requesting user is in the maps (in case they're not a member)
      if (requestingUser?._id) {
        userSubgroupMap.set(requestingUser._id, requestingUserSubgroupTag || 'Ungrouped');
        userShiftTagMap.set(requestingUser._id, requestingUserShiftTag);
      }

      // If subgrouping is enabled, filter by subgroup first
      // Each subgroup gets its own concurrent leave limit
      let relevantOverlappingCount = 0;
      
      if (team.settings.enableSubgrouping) {
        // Filter overlapping requests to only count those from the same subgroup
        const requestingSubgroup = requestingUserSubgroupTag || 'Ungrouped';
        
        for (const req of overlappingRequests) {
          const reqUserSubgroup = userSubgroupMap.get(req.userId) || 'Ungrouped';
          const reqUserShiftTag = userShiftTagMap.get(req.userId);
          
          // Only count if they're in the same subgroup
          if (requestingSubgroup !== reqUserSubgroup) continue;
          
          // Also check shift tag if applicable (existing logic)
          if (requestingUserShiftTag !== undefined) {
            if (reqUserShiftTag !== requestingUserShiftTag) continue;
          } else {
            // Requesting user has no shift tag - only count members with no shift tag
            if (reqUserShiftTag !== undefined) continue;
          }
          
          relevantOverlappingCount++;
        }
      } else {
        // Subgrouping disabled - use existing shift tag logic
        if (requestingUserShiftTag !== undefined) {
          // Count overlapping requests from users with the same shift tag
          for (const req of overlappingRequests) {
            const reqUserShiftTag = userShiftTagMap.get(req.userId);
            if (reqUserShiftTag === requestingUserShiftTag) {
              relevantOverlappingCount++;
            }
          }
        } else {
          // User has no shift tag - count all overlapping requests
          relevantOverlappingCount = overlappingRequests.length;
        }
      }

      if (relevantOverlappingCount >= team.settings.concurrentLeave) {
        let context = '';
        if (team.settings.enableSubgrouping && requestingUserSubgroupTag) {
          context = ` (${requestingUserSubgroupTag} subgroup)`;
        } else if (team.settings.enableSubgrouping && !requestingUserSubgroupTag) {
          context = ' (Ungrouped)';
        } else if (requestingUserShiftTag) {
          context = ` (${requestingUserShiftTag} shift)`;
        }
        return NextResponse.json(
          { 
            error: `Concurrent leave limit exceeded${context}. Maximum ${team.settings.concurrentLeave} team member(s) can be on leave simultaneously.` 
          },
          { status: 400 }
        );
      }
    }

    // Create the leave request
    // Historical requests are auto-approved for migration purposes
    const leaveRequest = await LeaveRequestModel.create({
      userId: requestUserId,
      teamId: user.teamId!,
      startDate: start,
      endDate: end,
      reason,
      status: isHistorical ? 'approved' : 'pending',
      requestedBy: requestedFor ? user.id : undefined,
    });

    return NextResponse.json(leaveRequest);
  } catch (error) {
    console.error('Create leave request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
