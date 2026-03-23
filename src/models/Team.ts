import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { ClientSession, ObjectId } from 'mongodb';
import { Team, TeamSettings } from '@/types';

export class TeamModel {
  static async create(
    team: Omit<Team, '_id' | 'createdAt'>,
    session?: ClientSession
  ): Promise<Team> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    
    const newTeam: Team = {
      ...team,
      createdAt: new Date(),
    };
    
    const result = await teams.insertOne(newTeam, session ? { session } : undefined);
    return { ...newTeam, _id: result.insertedId.toString() };
  }

  static async findByTeamUsername(teamUsername: string): Promise<Team | null> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    const normalizedTeamUsername = teamUsername.toLowerCase();
    const exactMatch = await teams.findOne({ teamUsername: normalizedTeamUsername });
    if (exactMatch) {
      return exactMatch;
    }

    // Legacy compatibility: support older records created with mixed-case team usernames.
    return await teams.findOne({
      teamUsername: { $regex: `^${normalizedTeamUsername}$`, $options: 'i' },
    });
  }

  static async findById(id: string): Promise<Team | null> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    try {
      const objectId = new ObjectId(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await teams.findOne({ _id: objectId } as any);
    } catch (error) {
      console.error('TeamModel.findById error:', error);
      return null;
    }
  }

  static async updateSettings(teamId: string, settings: TeamSettings): Promise<void> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    const objectId = new ObjectId(teamId);
    const result = await teams.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      { $set: { settings } }
    );
    
    // Verify the update was successful
    if (result.matchedCount === 0) {
      throw new Error(`Team with id ${teamId} not found`);
    }
    
    if (result.modifiedCount === 0) {
      console.warn(`[TeamModel] updateSettings: Team ${teamId} was matched but not modified (settings may be the same)`);
    }
    
    // Verify the write by reading it back immediately
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedTeam = await teams.findOne({ _id: objectId } as any);
    if (updatedTeam && updatedTeam.settings) {
      console.log('[TeamModel] updateSettings - Verification read:', {
        teamId,
        concurrentLeave: updatedTeam.settings.concurrentLeave,
        maxLeavePerYear: updatedTeam.settings.maxLeavePerYear,
        settingsKeys: Object.keys(updatedTeam.settings)
      });
    }
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const teams = db.collection<Team>('teams');
    
    try {
      // Create index for team username lookups
      await teams.createIndex({ teamUsername: 1 }, { unique: true });
      console.log('Team indexes created successfully');
    } catch (error) {
      console.error('Error creating Team indexes:', error);
      // Don't throw - indexes may already exist
    }
  }
}
