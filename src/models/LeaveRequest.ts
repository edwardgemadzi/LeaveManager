import { getDatabase } from '@/lib/mongodb';
import { ObjectId, ClientSession, Filter } from 'mongodb';
import { LeaveRequest } from '@/types';

export class LeaveRequestModel {
  private static buildIdQuery(field: 'userId' | 'teamId', id: string): Record<string, unknown> {
    const idStr = id.toString().trim();

    if (ObjectId.isValid(idStr)) {
      const objectId = new ObjectId(idStr);
      return {
        $or: [
          { [field]: objectId },
          { [field]: idStr }
        ]
      };
    }

    return { [field]: idStr };
  }

  private static buildNotDeletedQuery(): Record<string, unknown> {
    return {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    };
  }

  static async create(
    request: Omit<LeaveRequest, '_id' | 'createdAt' | 'updatedAt'>,
    session?: ClientSession
  ): Promise<LeaveRequest> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    
    const newRequest: LeaveRequest = {
      ...request,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const options = session ? { session } : {};
    const result = await requests.insertOne(newRequest, options);
    return { ...newRequest, _id: result.insertedId.toString() };
  }

  static async findByUserId(userId: string, includeDeleted = false): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const userQuery = LeaveRequestModel.buildIdQuery('userId', userId);
    const query = includeDeleted
      ? userQuery
      : { $and: [userQuery, LeaveRequestModel.buildNotDeletedQuery()] };
    return await requests.find(query).sort({ createdAt: -1 }).toArray();
  }

  static async findByTeamId(teamId: string, includeDeleted = false): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const teamQuery = LeaveRequestModel.buildIdQuery('teamId', teamId);
    const query = includeDeleted
      ? teamQuery
      : { $and: [teamQuery, LeaveRequestModel.buildNotDeletedQuery()] };
    return await requests.find(query).sort({ createdAt: -1 }).toArray();
  }

  static async findPendingByTeamId(teamId: string, includeDeleted = false): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const teamQuery = LeaveRequestModel.buildIdQuery('teamId', teamId);
    const query = {
      $and: [
        teamQuery,
        { status: 'pending' },
        ...(includeDeleted ? [] : [LeaveRequestModel.buildNotDeletedQuery()])
      ]
    };
    return await requests.find(query).sort({ createdAt: -1 }).toArray();
  }

  static async findById(id: string, includeDeleted = false): Promise<LeaveRequest | null> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    try {
      const objectId = new ObjectId(id);
      const baseQuery = { _id: objectId } as unknown as Filter<LeaveRequest>;
      const query = includeDeleted
        ? baseQuery
        : ({ $and: [baseQuery, LeaveRequestModel.buildNotDeletedQuery()] } as unknown as Filter<LeaveRequest>);
      return await requests.findOne(query);
    } catch (error) {
      console.error('LeaveRequestModel.findById error:', error);
      return null;
    }
  }

  static async updateStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const objectId = new ObjectId(id);
    await requests.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      { $set: { status, updatedAt: new Date() } }
    );
  }

  static async findOverlappingRequests(
    teamId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
    session?: ClientSession
  ): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    
    const teamQuery = LeaveRequestModel.buildIdQuery('teamId', teamId);
    const query: Record<string, unknown> = {
      $and: [
        teamQuery,
        { status: 'approved' },
        LeaveRequestModel.buildNotDeletedQuery(),
        {
          $or: [
            {
              startDate: { $lte: endDate },
              endDate: { $gte: startDate }
            }
          ]
        }
      ]
    };

    if (excludeId) {
      if (ObjectId.isValid(excludeId)) {
        query.$and = [
          ...(query.$and as Record<string, unknown>[]),
          { _id: { $ne: new ObjectId(excludeId) } }
        ];
      } else {
        query.$and = [
          ...(query.$and as Record<string, unknown>[]),
          { _id: { $ne: excludeId } }
        ];
      }
    }

    const options = session ? { session } : {};
    return await requests.find(query, options).toArray();
  }

  static async findPendingOverlappingRequestsForUser(
    userId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
    session?: ClientSession
  ): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');

    const userQuery = LeaveRequestModel.buildIdQuery('userId', userId);
    const query: Record<string, unknown> = {
      $and: [
        userQuery,
        { status: 'pending' },
        LeaveRequestModel.buildNotDeletedQuery(),
        {
          $or: [
            {
              startDate: { $lte: endDate },
              endDate: { $gte: startDate }
            }
          ]
        }
      ]
    };

    if (excludeId) {
      if (ObjectId.isValid(excludeId)) {
        query.$and = [
          ...(query.$and as Record<string, unknown>[]),
          { _id: { $ne: new ObjectId(excludeId) } }
        ];
      } else {
        query.$and = [
          ...(query.$and as Record<string, unknown>[]),
          { _id: { $ne: excludeId } }
        ];
      }
    }

    const options = session ? { session } : {};
    return await requests.find(query, options).toArray();
  }

  static async softDelete(id: string, deletedBy: string, session?: ClientSession): Promise<boolean> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    try {
      const objectId = new ObjectId(id);
      const options = session ? { session } : {};
      const result = await requests.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        { $set: { deletedAt: new Date(), deletedBy, updatedAt: new Date() } },
        options
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('LeaveRequestModel.softDelete error:', error);
      return false;
    }
  }

  // Backward-compatible alias (soft delete)
  static async delete(id: string, deletedBy: string, session?: ClientSession): Promise<boolean> {
    return LeaveRequestModel.softDelete(id, deletedBy, session);
  }

  static async restore(id: string, session?: ClientSession): Promise<boolean> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    try {
      const objectId = new ObjectId(id);
      const options = session ? { session } : {};
      const result = await requests.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        { $unset: { deletedAt: '', deletedBy: '' }, $set: { updatedAt: new Date() } },
        options
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('LeaveRequestModel.restore error:', error);
      return false;
    }
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    
    try {
      // Create indexes for common query patterns
      await requests.createIndex({ teamId: 1 });
      await requests.createIndex({ userId: 1 });
      await requests.createIndex({ status: 1 });
      await requests.createIndex({ teamId: 1, status: 1 }); // Compound index for team+status queries
      await requests.createIndex({ startDate: 1, endDate: 1 }); // For date range queries
      console.log('LeaveRequest indexes created successfully');
    } catch (error) {
      console.error('Error creating LeaveRequest indexes:', error);
      // Don't throw - indexes may already exist
    }
  }
}
