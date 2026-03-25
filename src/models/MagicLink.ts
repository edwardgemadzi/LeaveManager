import { getDatabaseRaw, getDatabase } from '@/lib/mongodb';

export const MAGIC_LINKS_COLLECTION = 'magic_links';

export type MagicLinkDoc = {
  nonceHash: string;
  userId: string;
  nextPath: string;
  createdAt: Date;
  expiresAt: Date;
};

export class MagicLinkModel {
  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const coll = db.collection<MagicLinkDoc>(MAGIC_LINKS_COLLECTION);
    try {
      await coll.createIndex({ nonceHash: 1 }, { unique: true });
      await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await coll.createIndex({ userId: 1, createdAt: -1 });
      console.log('MagicLink indexes created successfully');
    } catch (error) {
      console.error('Error creating MagicLink indexes:', error);
    }
  }

  static async insert(doc: MagicLinkDoc): Promise<void> {
    const db = await getDatabase();
    await db.collection<MagicLinkDoc>(MAGIC_LINKS_COLLECTION).insertOne(doc);
  }

  static async findOneAndDeleteValid(nonceHash: string): Promise<MagicLinkDoc | null> {
    const db = await getDatabase();
    const now = new Date();
    const out = await db.collection<MagicLinkDoc>(MAGIC_LINKS_COLLECTION).findOneAndDelete({
      nonceHash,
      expiresAt: { $gt: now },
    });
    return out ?? null;
  }
}

