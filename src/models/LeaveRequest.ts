import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';
import { ObjectId, ClientSession, Filter } from 'mongodb';
import { LeaveRequest } from '@/types';
import { MAX_REMINDER_DAY_OFFSET } from '@/lib/leaveReminderPrefs';

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

  static async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    decision?: {
      note?: string;
      byUserId: string;
      byUsername: string;
    }
  ): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const objectId = new ObjectId(id);
    await requests.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      {
        $set: {
          status,
          decisionNote: decision?.note,
          decisionAt: new Date(),
          decisionBy: decision?.byUserId,
          decisionByUsername: decision?.byUsername,
          updatedAt: new Date(),
        },
      }
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

  /**
   * Finds any active (pending OR approved) leave requests for a specific user
   * that overlap with the given date range. Used to prevent duplicate submissions
   * across all creation paths (normal, historical, emergency, restore).
   */
  static async findActiveOverlappingRequestsForUser(
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
        { status: { $in: ['pending', 'approved'] } },
        LeaveRequestModel.buildNotDeletedQuery(),
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    };

    if (excludeId) {
      if (ObjectId.isValid(excludeId)) {
        (query.$and as Record<string, unknown>[]).push({ _id: { $ne: new ObjectId(excludeId) } });
      } else {
        (query.$and as Record<string, unknown>[]).push({ _id: { $ne: excludeId } });
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

  static async updatePendingRequest(
    id: string,
    updates: Pick<LeaveRequest, 'startDate' | 'endDate' | 'reason'>
  ): Promise<LeaveRequest | null> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');

    try {
      const objectId = new ObjectId(id);
      await requests.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        }
      );

      return await requests.findOne(
        ({ _id: objectId } as unknown) as Filter<LeaveRequest>
      );
    } catch (error) {
      console.error('LeaveRequestModel.updatePendingRequest error:', error);
      return null;
    }
  }

  /**
   * Approved, not deleted, leave with startDate in a wide UTC window for reminder cron.
   * Window covers configurable offsets up to MAX_REMINDER_DAY_OFFSET calendar days ahead.
   */
  static async findApprovedForReminderScan(now: Date): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');

    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const windowStart = new Date(Date.UTC(y, m, d - 3));
    const windowEnd = new Date(Date.UTC(y, m, d + MAX_REMINDER_DAY_OFFSET + 5));

    const query = {
      $and: [
        { status: 'approved' as const },
        LeaveRequestModel.buildNotDeletedQuery(),
        { startDate: { $gte: windowStart, $lt: windowEnd } },
      ],
    };

    return requests.find(query).toArray();
  }

  static async markMemberReminderOffsetSent(id: string, day: number): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const objectId = new ObjectId(id);
    await requests.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      {
        $addToSet: { reminderMemberOffsetsSent: day },
        $set: { updatedAt: new Date() },
      }
    );
  }

  static async markLeaderReminderOffsetSent(id: string, day: number): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const objectId = new ObjectId(id);
    await requests.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      {
        $addToSet: { reminderLeaderOffsetsSent: day },
        $set: { updatedAt: new Date() },
      }
    );
  }

  static async updateConsentStatus(
    id: string,
    action: 'accepted' | 'declined',
  ): Promise<void> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    const objectId = new ObjectId(id);
    await requests.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      {
        $set: {
          memberConsentStatus: action,
          status: action === 'accepted' ? 'approved' : 'rejected',
          updatedAt: new Date(),
        },
      }
    );
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
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
