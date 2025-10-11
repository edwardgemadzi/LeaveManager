import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { User, ShiftSchedule } from '@/types';

export class UserModel {
  static async create(user: Omit<User, '_id' | 'createdAt'>): Promise<User> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    
    const newUser: User = {
      ...user,
      createdAt: new Date(),
    };
    
    const result = await users.insertOne(newUser);
    return { ...newUser, _id: result.insertedId.toString() };
  }

  static async findByUsername(username: string): Promise<User | null> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    return await users.findOne({ username });
  }

  static async findById(id: string): Promise<User | null> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    try {
      const objectId = new ObjectId(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await users.findOne({ _id: objectId } as any);
    } catch (error) {
      console.error('UserModel.findById error:', error);
      return null;
    }
  }

  static async findByTeamId(teamId: string): Promise<User[]> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    console.log('UserModel.findByTeamId - searching for teamId:', teamId);
    
    // Handle both string and ObjectId teamIds
    const results = await users.find({
      $or: [
        { teamId: teamId },
        // @ts-expect-error - ObjectId type compatibility issue
        { teamId: new ObjectId(teamId) }
      ]
    }).toArray();
    
    console.log('UserModel.findByTeamId - found users:', results.map(u => ({ id: u._id, username: u.username, teamId: u.teamId })));
    return results;
  }

  static async updateShiftSchedule(userId: string, shiftSchedule: ShiftSchedule): Promise<void> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    const objectId = new ObjectId(userId);
    await users.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      { $set: { shiftSchedule } }
    );
  }
}
