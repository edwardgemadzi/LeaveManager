import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Team, TeamSettings } from '@/types';

export class TeamModel {
  static async create(team: Omit<Team, '_id' | 'createdAt'>): Promise<Team> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    
    const newTeam: Team = {
      ...team,
      createdAt: new Date(),
    };
    
    const result = await teams.insertOne(newTeam);
    return { ...newTeam, _id: result.insertedId.toString() };
  }

  static async findByTeamUsername(teamUsername: string): Promise<Team | null> {
    const db = await getDatabase();
    const teams = db.collection<Team>('teams');
    return await teams.findOne({ teamUsername });
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
    await teams.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      { $set: { settings } }
    );
  }
}
