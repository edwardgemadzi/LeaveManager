import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { LeaveRequest } from '@/types';

export class LeaveRequestModel {
  static async create(request: Omit<LeaveRequest, '_id' | 'createdAt' | 'updatedAt'>): Promise<LeaveRequest> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    
    const newRequest: LeaveRequest = {
      ...request,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await requests.insertOne(newRequest);
    return { ...newRequest, _id: result.insertedId.toString() };
  }

  static async findByUserId(userId: string): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    return await requests.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  static async findByTeamId(teamId: string): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    return await requests.find({ teamId }).sort({ createdAt: -1 }).toArray();
  }

  static async findPendingByTeamId(teamId: string): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    return await requests.find({ teamId, status: 'pending' }).sort({ createdAt: -1 }).toArray();
  }

  static async findById(id: string): Promise<LeaveRequest | null> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    try {
      const objectId = new ObjectId(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await requests.findOne({ _id: objectId } as any);
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
    excludeId?: string
  ): Promise<LeaveRequest[]> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    
    const query: Record<string, unknown> = {
      teamId,
      status: 'approved',
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate }
        }
      ]
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    return await requests.find(query).toArray();
  }

  static async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    const requests = db.collection<LeaveRequest>('leaveRequests');
    try {
      const objectId = new ObjectId(id);
      const result = await requests.deleteOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any
      );
      return result.deletedCount > 0;
    } catch (error) {
      console.error('LeaveRequestModel.delete error:', error);
      return false;
    }
  }
}
