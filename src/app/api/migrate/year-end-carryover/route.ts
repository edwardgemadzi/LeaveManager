import { NextRequest, NextResponse } from 'next/server';
import { updateAllTeamsCarryover, updateTeamCarryover } from '@/lib/carryoverYearEnd';
import { TeamModel } from '@/models/Team';
import { requireLocalhost } from '@/lib/localhost-helpers';

/**
 * API endpoint to update carryover for all teams or a specific team at year end
 * This should be called via a scheduled job (e.g., cron) at the end of each year
 * 
 * Query parameters:
 * - previousYear: The year to calculate carryover from (defaults to last year)
 * - teamId: Optional - if provided, only update this team
 */
export async function POST(request: NextRequest) {
  try {
    const localhostResult = requireLocalhost(request, 'ADMIN_ENABLED');
    if (localhostResult) {
      return localhostResult;
    }

    const { searchParams } = new URL(request.url);
    const previousYearParam = searchParams.get('previousYear');
    const teamIdParam = searchParams.get('teamId');
    
    // Default to last year if not specified
    const previousYear = previousYearParam 
      ? parseInt(previousYearParam, 10) 
      : new Date().getFullYear() - 1;
    
    if (isNaN(previousYear)) {
      return NextResponse.json({ 
        error: 'Invalid previousYear parameter' 
      }, { status: 400 });
    }
    
    // If teamId is provided, update only that team
    if (teamIdParam) {
      const team = await TeamModel.findById(teamIdParam);
      if (!team) {
        return NextResponse.json({ 
          error: 'Team not found' 
        }, { status: 404 });
      }
      
      const result = await updateTeamCarryover(teamIdParam, previousYear);
      return NextResponse.json({
        message: 'Carryover updated successfully',
        previousYear,
        result
      });
    }
    
    // Otherwise, update all teams
    const result = await updateAllTeamsCarryover(previousYear);
    return NextResponse.json({
      message: 'Carryover updated for all teams',
      previousYear,
      result
    });
  } catch (error) {
    console.error('Error updating year-end carryover:', error);
    return NextResponse.json({ 
      error: 'Failed to update carryover',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
