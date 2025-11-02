import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { User, ShiftSchedule } from '@/types';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';

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
    
    // Get all members first, then filter by teamId in JavaScript
    // This approach is more flexible and handles all formats (string, ObjectId, etc.)
    const allMembers = await users.find({
      role: 'member'
    }).toArray();
    
    // Filter members by teamId
    const teamIdStr = teamId.toString().trim();
    const filteredResults = allMembers.filter(u => {
      if (!u.teamId) return false;
      // Convert both to strings and compare
      const memberTeamIdStr = String(u.teamId).trim();
      return memberTeamIdStr === teamIdStr;
    });
    
    console.log('UserModel.findByTeamId - found users:', filteredResults.length, 'members');
    return filteredResults;
  }


  static async updateShiftSchedule(userId: string, shiftSchedule: ShiftSchedule): Promise<void> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    const objectId = new ObjectId(userId);
    
    // Only store tag for fixed schedules (tags are stable)
    // For rotating schedules, tags change daily and should be regenerated
    if (shiftSchedule.type === 'fixed') {
      const workingDaysTag = generateWorkingDaysTag(shiftSchedule);
      await users.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        { $set: { shiftSchedule, workingDaysTag } }
      );
    } else {
      // For rotating schedules, remove stored tag (will be regenerated on use)
    await users.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
        { 
          $set: { shiftSchedule },
          $unset: { workingDaysTag: '' }
        }
      );
    }
  }

  static async updateWorkingDaysTag(userId: string): Promise<void> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    const objectId = new ObjectId(userId);
    
    // Get user's current schedule
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await users.findOne({ _id: objectId } as any);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Only update tag for fixed schedules (tags are stable)
    // For rotating schedules, tags change daily and should be regenerated on use
    if (user.shiftSchedule && user.shiftSchedule.type === 'fixed') {
      const workingDaysTag = generateWorkingDaysTag(user.shiftSchedule);
      
      await users.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        { $set: { workingDaysTag } }
    );
    } else if (user.shiftSchedule && user.shiftSchedule.type === 'rotating') {
      // For rotating schedules, remove stored tag (will be regenerated on use)
      await users.updateOne(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: objectId } as any,
        { $unset: { workingDaysTag: '' } }
      );
    }
  }
}
