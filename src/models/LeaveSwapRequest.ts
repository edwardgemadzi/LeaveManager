import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { ObjectId, ClientSession, Filter } from 'mongodb';
import { LeaveSwapRequest, LeaveSwapRequestStatus } from '@/types';

export class LeaveSwapRequestModel {
  private static buildIdQuery(field: 'userId' | 'teamId' | 'leaveRequestId', id: string): Record<string, unknown> {
    const idStr = id.toString().trim();

    if (ObjectId.isValid(idStr)) {
      const objectId = new ObjectId(idStr);
      return {
        $or: [{ [field]: objectId }, { [field]: idStr }],
      };
    }

    return { [field]: idStr };
  }

  static async create(
    doc: Omit<LeaveSwapRequest, '_id' | 'createdAt' | 'updatedAt'>,
    session?: ClientSession
  ): Promise<LeaveSwapRequest> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const row: LeaveSwapRequest = {
      ...doc,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const options = session ? { session } : {};
    const result = await col.insertOne(row, options);
    return { ...row, _id: result.insertedId.toString() };
  }

  static async findById(id: string, session?: ClientSession): Promise<LeaveSwapRequest | null> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    try {
      const objectId = new ObjectId(id);
      const options = session ? { session } : {};
      return await col.findOne({ _id: objectId } as unknown as Filter<LeaveSwapRequest>, options);
    } catch {
      return null;
    }
  }

  static async findPendingByLeaveRequestId(
    leaveRequestId: string,
    session?: ClientSession
  ): Promise<LeaveSwapRequest | null> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const q = LeaveSwapRequestModel.buildIdQuery('leaveRequestId', leaveRequestId);
    const query = {
      $and: [q, { status: 'pending' as const }],
    };
    const options = session ? { session } : {};
    return await col.findOne(query, options);
  }

  static async findByUserId(userId: string, status?: LeaveSwapRequestStatus): Promise<LeaveSwapRequest[]> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const userQ = LeaveSwapRequestModel.buildIdQuery('userId', userId);
    const query = status ? { $and: [userQ, { status }] } : userQ;
    return await col.find(query).sort({ createdAt: -1 }).toArray();
  }

  static async findByTeamId(
    teamId: string,
    opts?: { status?: LeaveSwapRequestStatus }
  ): Promise<LeaveSwapRequest[]> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const teamQ = LeaveSwapRequestModel.buildIdQuery('teamId', teamId);
    const query = opts?.status ? { $and: [teamQ, { status: opts.status }] } : teamQ;
    return await col.find(query).sort({ createdAt: -1 }).toArray();
  }

  static async updateDecision(
    id: string,
    params: {
      status: Exclude<LeaveSwapRequestStatus, 'pending' | 'cancelled'>;
      decisionNote?: string;
      byUserId: string;
      byUsername: string;
    },
    session?: ClientSession
  ): Promise<boolean> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const objectId = new ObjectId(id);
    const options = session ? { session } : {};
    const result = await col.updateOne(
      { _id: objectId, status: 'pending' } as unknown as Filter<LeaveSwapRequest>,
      {
        $set: {
          status: params.status,
          decisionNote: params.decisionNote,
          decisionAt: new Date(),
          decisionBy: params.byUserId,
          decisionByUsername: params.byUsername,
          updatedAt: new Date(),
        },
      },
      options
    );
    return result.modifiedCount > 0;
  }

  static async cancelPending(id: string, userId: string, session?: ClientSession): Promise<boolean> {
    const db = await getDatabase();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    const objectId = new ObjectId(id);
    const userQ = LeaveSwapRequestModel.buildIdQuery('userId', userId);
    const options = session ? { session } : {};
    const result = await col.updateOne(
      {
        $and: [
          { _id: objectId } as unknown as Filter<LeaveSwapRequest>,
          userQ,
          { status: 'pending' as const },
        ],
      },
      { $set: { status: 'cancelled' as const, updatedAt: new Date() } },
      options
    );
    return result.modifiedCount > 0;
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const col = db.collection<LeaveSwapRequest>('leaveSwapRequests');
    try {
      await col.createIndex({ teamId: 1, status: 1 });
      await col.createIndex({ userId: 1, status: 1 });
      await col.createIndex({ leaveRequestId: 1, status: 1 });
      await col.createIndex({ teamId: 1, createdAt: -1 });
      console.log('LeaveSwapRequest indexes created successfully');
    } catch (error) {
      console.error('Error creating LeaveSwapRequest indexes:', error);
    }
  }
}
