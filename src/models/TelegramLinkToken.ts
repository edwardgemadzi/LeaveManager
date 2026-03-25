import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export const TELEGRAM_LINK_TOKENS_COLLECTION = 'telegram_link_tokens';

export type TelegramLinkTokenDoc = {
  token: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
};

export class TelegramLinkTokenModel {
  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const coll = db.collection<TelegramLinkTokenDoc>(TELEGRAM_LINK_TOKENS_COLLECTION);
    try {
      await coll.createIndex({ token: 1 }, { unique: true });
      await coll.createIndex({ userId: 1 });
      await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      console.log('Telegram link token indexes created successfully');
    } catch (error) {
      console.error('Error creating Telegram link token indexes:', error);
    }
  }

  static async deleteManyForUser(userId: ObjectId): Promise<void> {
    const db = await getDatabase();
    const coll = db.collection<TelegramLinkTokenDoc>(TELEGRAM_LINK_TOKENS_COLLECTION);
    await coll.deleteMany({ userId });
  }

  static async insert(doc: TelegramLinkTokenDoc): Promise<void> {
    const db = await getDatabase();
    const coll = db.collection<TelegramLinkTokenDoc>(TELEGRAM_LINK_TOKENS_COLLECTION);
    await coll.insertOne(doc);
  }

  /**
   * Atomically claim a valid token (single use). Returns the doc or null.
   */
  static async findOneAndDeleteValid(token: string): Promise<TelegramLinkTokenDoc | null> {
    const db = await getDatabase();
    const coll = db.collection<TelegramLinkTokenDoc>(TELEGRAM_LINK_TOKENS_COLLECTION);
    const now = new Date();
    const result = await coll.findOneAndDelete({
      token,
      expiresAt: { $gt: now },
    });
    return result ?? null;
  }
}
