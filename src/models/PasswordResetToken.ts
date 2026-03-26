import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { PasswordResetToken } from '@/types';

export class PasswordResetTokenModel {
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  static async create(input: Omit<PasswordResetToken, '_id' | 'createdAt'>): Promise<PasswordResetToken> {
    const db = await getDatabase();
    const tokens = db.collection<PasswordResetToken>('passwordResetTokens');
    const doc: PasswordResetToken = { ...input, createdAt: new Date() };
    const result = await tokens.insertOne(doc);
    return { ...doc, _id: result.insertedId.toString() };
  }

  static async findActiveByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const db = await getDatabase();
    return db.collection<PasswordResetToken>('passwordResetTokens').findOne({
      tokenHash,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Atomically marks a valid token as used. Returns the updated document, or null if none matched.
   */
  static async consumeActiveByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const db = await getDatabase();
    const now = new Date();
    const result = await db.collection<PasswordResetToken>('passwordResetTokens').findOneAndUpdate(
      {
        tokenHash,
        usedAt: { $exists: false },
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { returnDocument: 'after' }
    );
    // Mongo driver returns the updated document (or null) in most configurations,
    // but some environments return a wrapper result. Normalize to a document here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyResult = result as any;
    if (anyResult && typeof anyResult === 'object' && 'value' in anyResult) {
      return anyResult.value ?? null;
    }
    return result as unknown as PasswordResetToken | null;
  }

  static async markUsed(id: string): Promise<void> {
    const db = await getDatabase();
    await db.collection<PasswordResetToken>('passwordResetTokens').updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: new ObjectId(id) } as any,
      { $set: { usedAt: new Date() } }
    );
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const tokens = db.collection<PasswordResetToken>('passwordResetTokens');
    await tokens.createIndex({ tokenHash: 1 }, { unique: true });
    await tokens.createIndex({ userId: 1, createdAt: -1 });
    await tokens.createIndex({ expiresAt: 1 });
  }
}

