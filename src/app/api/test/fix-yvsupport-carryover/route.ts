import { NextRequest, NextResponse } from 'next/server';
import { updateTeamCarryover } from '@/lib/carryoverYearEnd';
import { TeamModel } from '@/models/Team';
import { UserModel } from '@/models/User';
import { getDatabase } from '@/lib/mongodb';
import { LeaveRequest } from '@/types';
import { parseDateSafe } from '@/lib/dateUtils';
import { isMaternityLeave, countWorkingDays } from '@/lib/leaveCalculations';

/**
 * Fix carryover data for yvsupport team members based on their 2025 usage
 * This endpoint now uses the reusable updateTeamCarryover function from carryoverYearEnd.ts
 * 
 * @param request - Optional JSON body with { previousYear: number } (defaults to 2025)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse optional previousYear from request body (defaults to 2025)
    let previousYear = 2025;
    try {
      const body = await request.json();
      if (body.previousYear && typeof body.previousYear === 'number') {
        previousYear = body.previousYear;
      }
    } catch {
      // No body provided, use default
    }
    
    // Find yvsupport team
    const team = await TeamModel.findByTeamUsername('yvsupport');
    
    if (!team) {
      return NextResponse.json({ error: 'yvsupport team not found' }, { status: 404 });
    }
    
    // Use the reusable library function to update carryover
    const result = await updateTeamCarryover(String(team._id), previousYear);
    
    // Get member details for detailed response (maintaining backward compatibility)
    const members = await UserModel.findByTeamId(team._id!);
    const db = await getDatabase();
    const requestsCollection = db.collection<LeaveRequest>('leaveRequests');
    const teamIdStr = String(team._id);
    const allRequests = await requestsCollection.find({ teamId: teamIdStr }).toArray();
    const allApprovedRequests = allRequests.filter(req => req.status === 'approved');
    
    const lastYearStart = new Date(previousYear, 0, 1);
    lastYearStart.setHours(0, 0, 0, 0);
    const lastYearEnd = new Date(previousYear, 11, 31);
    lastYearEnd.setHours(23, 59, 59, 999);
    const maxLeavePerYear = team.settings.maxLeavePerYear;
    
    // Build detailed member results for backward compatibility
    const memberResults = await Promise.all(members.map(async (member) => {
      const memberRequests = allApprovedRequests.filter(req => 
        String(req.userId).trim() === String(member._id).trim()
      );
      
      const lastYearRequests = memberRequests.filter(req => {
        const reqStart = parseDateSafe(req.startDate);
        const reqEnd = parseDateSafe(req.endDate);
        return reqStart <= lastYearEnd && reqEnd >= lastYearStart;
      }).filter(req => !req.reason || !isMaternityLeave(req.reason));
      
      const lastYearWorkingDays = lastYearRequests.reduce((total, req) => {
        const reqStart = parseDateSafe(req.startDate);
        const reqEnd = parseDateSafe(req.endDate);
        reqStart.setHours(0, 0, 0, 0);
        reqEnd.setHours(23, 59, 59, 999);
        
        if (reqStart <= lastYearEnd && reqEnd >= lastYearStart) {
          const overlapStart = reqStart > lastYearStart ? reqStart : lastYearStart;
          const overlapEnd = reqEnd < lastYearEnd ? reqEnd : lastYearEnd;
          
          if (overlapEnd >= overlapStart) {
            return total + countWorkingDays(overlapStart, overlapEnd, member);
          }
        }
        return total;
      }, 0);
      
      const expectedCarryover = Math.max(0, maxLeavePerYear - lastYearWorkingDays);
      const currentCarryover = member.carryoverFromPreviousYear ?? 0;
      const wasUpdated = currentCarryover !== expectedCarryover;
      
      return {
        username: member.username,
        fullName: member.fullName,
        lastYear: {
          daysUsed: lastYearWorkingDays,
          maxLeave: maxLeavePerYear,
          expectedCarryover
        },
        current: {
          carryoverInDatabase: currentCarryover
        },
        update: wasUpdated ? {
          updated: true,
          matched: true,
          carryoverSet: expectedCarryover,
          expiryDate: member.carryoverExpiryDate?.toISOString() || null
        } : {
          updated: false,
          reason: currentCarryover === expectedCarryover 
            ? 'Already correct' 
            : expectedCarryover === 0 
            ? 'No carryover expected' 
            : 'Not updated'
        }
      };
    }));
    
    const summary = {
      totalMembers: result.totalMembers,
      membersUpdated: result.membersUpdated,
      membersWithCarryover: result.membersWithCarryover,
      totalCarryoverDays: result.totalCarryoverDays
    };
    
    return NextResponse.json({
      team: {
        name: team.name,
        teamUsername: team.teamUsername,
        allowCarryover: team.settings.allowCarryover,
        maxLeavePerYear: team.settings.maxLeavePerYear,
      },
      summary,
      members: memberResults,
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error) {
    console.error('Error fixing yvsupport carryover:', error);
    return NextResponse.json({ 
      error: 'Failed to fix carryover data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
