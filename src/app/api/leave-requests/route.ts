import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { LeaveRequestModel } from '@/models/LeaveRequest';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { CreateLeaveRequest, LeaveRequest } from '@/types';
import { isBypassNoticePeriodActive } from '@/lib/noticePeriod';
import { validateRequest, schemas } from '@/lib/validation';
import { getClient } from '@/lib/mongodb';
import { broadcastTeamUpdate } from '@/lib/teamEvents';
import { error as logError, info } from '@/lib/logger';
import { internalServerError } from '@/lib/errors';
import { parseDateSafe } from '@/lib/dateUtils';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { teamIdsMatch } from '@/lib/helpers';

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
    const includeDeleted =
      request.nextUrl.searchParams.get('includeDeleted') === 'true' && user.role === 'leader';
    let requests = await LeaveRequestModel.findByTeamId(user.teamId, includeDeleted);

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
    logError('Get leave requests error:', error);
    return internalServerError();
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

    // Parse dates safely to avoid timezone shifts
    // When a date string like "2026-01-22" is parsed, JavaScript interprets it as UTC midnight
    // parseDateSafe normalizes it to local midnight to preserve the intended date
    const start = parseDateSafe(startDate);
    const end = parseDateSafe(endDate);

    if (start > end) {
      return NextResponse.json(
        { error: 'End date must be on or after start date' },
        { status: 400 }
      );
    }

    // Determine the user ID for the request
    if (requestedFor && user.role !== 'leader') {
      return NextResponse.json(
        { error: 'Only leaders can create requests for other users' },
        { status: 403 }
      );
    }

    if (requestedFor && user.role !== 'leader') {
      return NextResponse.json({ error: 'Only leaders can request for other users' }, { status: 403 });
    }
    const requestUserId = requestedFor || user.id;

    if (!user.teamId) {
      return NextResponse.json({ error: 'No team assigned' }, { status: 400 });
    }

    if (requestedFor) {
      const targetUser = await UserModel.findById(requestedFor);
      if (!targetUser) {
        return NextResponse.json({ error: 'Requested user not found' }, { status: 404 });
      }

      if (!teamIdsMatch(targetUser.teamId, user.teamId)) {
        return NextResponse.json(
          { error: 'Requested user is not in your team' },
          { status: 403 }
        );
      }
    }

    // Get team settings for validation
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Validate requested user belongs to the same team (if applicable)
    const requestUser = await UserModel.findById(requestUserId);
    if (!requestUser) {
      return NextResponse.json({ error: 'Requesting user not found' }, { status: 404 });
    }
    if (!teamIdsMatch(requestUser.teamId, user.teamId)) {
      return NextResponse.json({ error: 'Requested user is not in your team' }, { status: 403 });
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

    // Get the requesting user's shift tag and subgroup tag (needed for both transaction and historical)
    const requestingUserShiftTag = requestUser?.shiftTag;
    const requestingUserSubgroupTag = requestUser?.subgroupTag;

    // Fetch all team members ONCE to avoid N+1 queries (needed for both transaction and historical)
    const teamMembers = await UserModel.findByTeamId(user.teamId);
    
    // Create maps for O(1) lookups
    const userSubgroupMap = new Map<string, string>();
    const userShiftTagMap = new Map<string, string | undefined>();
    const userMap = new Map<string, typeof teamMembers[number]>();
    teamMembers.forEach(member => {
      if (member._id) {
        const memberId = String(member._id);
        userSubgroupMap.set(memberId, member.subgroupTag || 'Ungrouped');
        userShiftTagMap.set(memberId, member.shiftTag);
        userMap.set(memberId, member);
      }
    });
    
    // Ensure requesting user is in the maps (in case they're not a member)
    if (requestUser?._id) {
      const requestUserId = String(requestUser._id);
      userSubgroupMap.set(requestUserId, requestingUserSubgroupTag || 'Ungrouped');
      userShiftTagMap.set(requestUserId, requestingUserShiftTag);
      userMap.set(requestUserId, requestUser);
    }

    // Check concurrent leave limit and create request atomically using MongoDB transaction
    // Historical requests are for migration purposes and should not be restricted
    let leaveRequest: LeaveRequest;
    
    if (!isHistorical) {
      // Use MongoDB transaction to ensure first-come-first-serve
      const client = await getClient();
      const session = client.startSession();

      try {
        await session.withTransaction(async () => {
          // Prevent duplicate pending requests for the same user and date range
          const pendingOverlaps = await LeaveRequestModel.findPendingOverlappingRequestsForUser(
            requestUserId,
            start,
            end,
            undefined,
            session
          );
          if (pendingOverlaps.length > 0) {
            throw new Error('DUPLICATE_PENDING_REQUEST: You already have a pending leave request for one or more of the selected dates.');
          }

          // Check availability (read-locked query with session)
          const overlappingRequests = await LeaveRequestModel.findOverlappingRequests(
            user.teamId!,
            start,
            end,
            undefined,
            session
          );

          const requestStartDate = new Date(start);
          requestStartDate.setHours(0, 0, 0, 0);
          const requestEndDate = new Date(end);
          requestEndDate.setHours(0, 0, 0, 0);

          let exceedsConcurrentLimit = false;
          for (let checkDate = new Date(requestStartDate); checkDate <= requestEndDate; checkDate.setDate(checkDate.getDate() + 1)) {
            // Skip non-working days for the requesting user
            if (!isWorkingDay(checkDate, requestUser)) {
              continue;
            }

            // Count relevant overlapping requests for this date (respecting shift/subgroup filters)
            let relevantOverlappingCount = 0;
            for (const req of overlappingRequests) {
              const reqStart = parseDateSafe(req.startDate);
              const reqEnd = parseDateSafe(req.endDate);
              reqStart.setHours(0, 0, 0, 0);
              reqEnd.setHours(23, 59, 59, 999);

              if (checkDate < reqStart || checkDate > reqEnd) {
                continue;
              }

              const reqUserId = String(req.userId);
              const reqUser = userMap.get(reqUserId);
              if (!reqUser) {
                continue;
              }

              // Only count if the other user works on this date
              if (!isWorkingDay(checkDate, reqUser)) {
                continue;
              }

              if (team.settings.enableSubgrouping) {
                const requestingSubgroup = requestingUserSubgroupTag || 'Ungrouped';
                const reqUserSubgroup = userSubgroupMap.get(reqUserId) || 'Ungrouped';
                if (requestingSubgroup !== reqUserSubgroup) continue;
              }
              
              if (requestingUserShiftTag !== undefined) {
                const reqUserShiftTag = userShiftTagMap.get(reqUserId);
                if (reqUserShiftTag !== requestingUserShiftTag) continue;
              } else {
                const reqUserShiftTag = userShiftTagMap.get(reqUserId);
                if (reqUserShiftTag !== undefined) continue;
              }
              
              relevantOverlappingCount++;
            }

            if (relevantOverlappingCount >= team.settings.concurrentLeave) {
              exceedsConcurrentLimit = true;
              break;
            }
          }

          // If not available, throw error (409 Conflict)
          if (exceedsConcurrentLimit) {
            let context = '';
            if (team.settings.enableSubgrouping && requestingUserSubgroupTag) {
              context = ` (${requestingUserSubgroupTag} subgroup)`;
            } else if (team.settings.enableSubgrouping && !requestingUserSubgroupTag) {
              context = ' (Ungrouped)';
            } else if (requestingUserShiftTag) {
              context = ` (${requestingUserShiftTag} shift)`;
            }
            throw new Error(`SLOT_UNAVAILABLE: Concurrent leave limit exceeded${context}. Maximum ${team.settings.concurrentLeave} team member(s) can be on leave simultaneously.`);
          }

          // If available, create request (atomic write)
          leaveRequest = await LeaveRequestModel.create({
            userId: requestUserId,
            teamId: user.teamId!,
            startDate: start,
            endDate: end,
            reason,
            status: 'pending',
            requestedBy: requestedFor ? user.id : undefined,
          }, session);
        });
      } catch (error) {
        await session.endSession();
        
        if (error instanceof Error && error.message.startsWith('DUPLICATE_PENDING_REQUEST:')) {
          return NextResponse.json(
            { error: error.message.replace('DUPLICATE_PENDING_REQUEST: ', '') },
            { status: 409 }
          );
        }

        // Handle slot unavailable error (409 Conflict)
        if (error instanceof Error && error.message.startsWith('SLOT_UNAVAILABLE:')) {
          return NextResponse.json(
            { 
              error: 'This time slot is no longer available. Please select different dates.',
              details: error.message.replace('SLOT_UNAVAILABLE: ', '')
            },
            { status: 409 }
          );
        }
        
        // Re-throw other errors
        throw error;
      } finally {
        await session.endSession();
      }
    } else {
      // Historical requests are auto-approved for migration purposes
      // Skip transaction for historical requests
      leaveRequest = await LeaveRequestModel.create({
        userId: requestUserId,
        teamId: user.teamId!,
        startDate: start,
        endDate: end,
        reason,
        status: 'approved',
        requestedBy: requestedFor ? user.id : undefined,
      });
    }

    // Broadcast event after successful creation (outside transaction)
    // leaveRequest is guaranteed to be assigned at this point (either in transaction or else block)
    // Use definite assignment assertion to satisfy TypeScript
    const createdRequest = leaveRequest!;
    
    // Serialize dates to ISO strings for JSON compatibility
    // _id is guaranteed to exist since we just created the request
    const eventData = {
      requestId: (createdRequest._id || '').toString(),
      userId: createdRequest.userId.toString(),
      startDate: createdRequest.startDate instanceof Date 
        ? createdRequest.startDate.toISOString() 
        : new Date(createdRequest.startDate).toISOString(),
      endDate: createdRequest.endDate instanceof Date 
        ? createdRequest.endDate.toISOString() 
        : new Date(createdRequest.endDate).toISOString(),
      reason: createdRequest.reason,
      status: createdRequest.status,
    };
    
    info(`[LeaveRequest] Broadcasting leaveRequestCreated event for team ${user.teamId}:`, eventData);
    broadcastTeamUpdate(user.teamId!, 'leaveRequestCreated', eventData);

    return NextResponse.json(createdRequest);
  } catch (error) {
    logError('Create leave request error:', error);
    return internalServerError();
  }
}
