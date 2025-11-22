import { NextRequest, NextResponse } from 'next/server';
import { requireLeader } from '@/lib/api-helpers';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { 
  suggestSubgroupAssignments, 
  findMembersWithPartialOverlap,
  SubgroupSuggestions 
} from '@/lib/analyticsCalculations';
import { error as logError } from '@/lib/logger';
import { internalServerError, badRequestError, notFoundError } from '@/lib/errors';

/**
 * GET /api/team/partial-overlap
 * Get suggested subgroup assignments based on partial overlap detection
 * 
 * Returns:
 * - suggestions: Array of suggested subgroup assignments
 * - conflicts: Array of conflicts (members with overlap but different subgroups)
 */
export async function GET(request: NextRequest) {
  try {
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    if (!user.teamId) {
      return notFoundError('Team not found');
    }

    // Get team to check subgrouping settings
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return notFoundError('Team not found');
    }

    // Check if subgrouping is enabled
    if (!team.settings.enableSubgrouping || !team.settings.subgroups || team.settings.subgroups.length < 2) {
      return badRequestError('Subgrouping must be enabled with at least 2 subgroups to use partial overlap detection');
    }

    // Get all team members
    const members = await UserModel.findByTeamId(user.teamId);
    
    // Filter out leader
    const teamMembers = members.filter(m => m.role === 'member');

    // Get suggestions based on partial overlap
    const suggestions = suggestSubgroupAssignments(
      teamMembers,
      team.settings.subgroups,
      30 // Check next 30 days for overlap
    );

    return NextResponse.json({
      suggestions: suggestions.suggestions,
      conflicts: suggestions.conflicts,
      totalMembers: teamMembers.length,
      totalGroups: new Set(suggestions.suggestions.map(s => s.suggestedSubgroup)).size,
    });
  } catch (error) {
    logError('Get partial overlap suggestions error:', error);
    return internalServerError();
  }
}

/**
 * POST /api/team/partial-overlap
 * Apply suggested subgroup assignments based on partial overlap
 * 
 * Body:
 * - applyAll: boolean - If true, apply all suggestions. If false, apply only specified memberIds
 * - memberIds?: string[] - Optional array of member IDs to apply suggestions for (if applyAll is false)
 */
export async function POST(request: NextRequest) {
  try {
    // Require leader authentication
    const authResult = requireLeader(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const user = authResult;

    if (!user.teamId) {
      return notFoundError('Team not found');
    }

    const body = await request.json();
    const { applyAll = false, memberIds = [] } = body;

    // Validate input
    if (!applyAll && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return badRequestError('Either applyAll must be true or memberIds must be provided');
    }

    // Get team to check subgrouping settings
    const team = await TeamModel.findById(user.teamId);
    if (!team) {
      return notFoundError('Team not found');
    }

    // Check if subgrouping is enabled
    if (!team.settings.enableSubgrouping || !team.settings.subgroups || team.settings.subgroups.length < 2) {
      return badRequestError('Subgrouping must be enabled with at least 2 subgroups');
    }

    // Get all team members
    const members = await UserModel.findByTeamId(user.teamId);
    
    // Filter out leader
    const teamMembers = members.filter(m => m.role === 'member');

    // Get suggestions based on partial overlap
    const suggestions = suggestSubgroupAssignments(
      teamMembers,
      team.settings.subgroups,
      30 // Check next 30 days for overlap
    );

    // Determine which suggestions to apply
    const suggestionsToApply = applyAll
      ? suggestions.suggestions
      : suggestions.suggestions.filter(s => memberIds.includes(s.memberId));

    // Apply suggestions
    const applied: string[] = [];
    const failed: Array<{ memberId: string; error: string }> = [];

    for (const suggestion of suggestionsToApply) {
      try {
        // Validate subgroup exists
        if (!team.settings.subgroups?.includes(suggestion.suggestedSubgroup)) {
          failed.push({
            memberId: suggestion.memberId,
            error: `Subgroup "${suggestion.suggestedSubgroup}" does not exist`,
          });
          continue;
        }

        // Update member's subgroup
        const member = await UserModel.findById(suggestion.memberId);
        if (!member) {
          failed.push({
            memberId: suggestion.memberId,
            error: 'Member not found',
          });
          continue;
        }

        // Verify member belongs to the same team
        if (member.teamId !== user.teamId) {
          failed.push({
            memberId: suggestion.memberId,
            error: 'Member does not belong to your team',
          });
          continue;
        }

        // Update subgroup using PATCH endpoint logic
        const db = await getDatabase();
        const users = db.collection('users');
        await users.updateOne(
          { _id: new ObjectId(suggestion.memberId) },
          { $set: { subgroupTag: suggestion.suggestedSubgroup } }
        );
        applied.push(suggestion.memberId);
      } catch (error) {
        logError(`Failed to apply suggestion for member ${suggestion.memberId}:`, error);
        failed.push({
          memberId: suggestion.memberId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      applied: applied.length,
      failed: failed.length,
      appliedMemberIds: applied,
      failedMembers: failed,
    });
  } catch (error) {
    logError('Apply partial overlap suggestions error:', error);
    return internalServerError();
  }
}

