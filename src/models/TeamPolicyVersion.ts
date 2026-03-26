import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { TeamPolicyVersion, TeamSettings } from '@/types';

export class TeamPolicyVersionModel {
  static async create(input: {
    teamId: string;
    effectiveFrom: Date;
    settings: TeamSettings;
    createdBy: string;
    versionLabel?: string;
  }): Promise<TeamPolicyVersion> {
    const db = await getDatabase();
    const collection = db.collection<TeamPolicyVersion>('teamPolicyVersions');
    const doc: TeamPolicyVersion = {
      teamId: input.teamId,
      effectiveFrom: input.effectiveFrom,
      settings: input.settings,
      createdBy: input.createdBy,
      versionLabel: input.versionLabel,
      createdAt: new Date(),
    };
    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId.toString() };
  }

  static async list(teamId: string): Promise<TeamPolicyVersion[]> {
    const db = await getDatabase();
    return db
      .collection<TeamPolicyVersion>('teamPolicyVersions')
      .find({ teamId })
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .toArray();
  }

  static async resolve(teamId: string, at: Date): Promise<TeamPolicyVersion | null> {
    const db = await getDatabase();
    return db.collection<TeamPolicyVersion>('teamPolicyVersions').findOne(
      { teamId, effectiveFrom: { $lte: at } },
      { sort: { effectiveFrom: -1, createdAt: -1 } }
    );
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const collection = db.collection<TeamPolicyVersion>('teamPolicyVersions');
    await collection.createIndex({ teamId: 1, effectiveFrom: -1 });
  }
}

