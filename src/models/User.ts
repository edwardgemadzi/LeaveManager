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
    
    try {
      // Build query that handles both ObjectId and string formats
      const teamIdStr = teamId.toString().trim();
      
      // Try to create ObjectId if teamId is a valid ObjectId string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any;
      
      try {
        const objectId = new ObjectId(teamId);
        // Use $or to query both ObjectId and string formats
        // This ensures we match regardless of how teamId is stored
        query = {
          role: 'member',
          $or: [
            { teamId: objectId },
            { teamId: teamIdStr }
          ]
        };
      } catch {
        // Not a valid ObjectId, just query as string
        query = {
          role: 'member',
          teamId: teamIdStr
        };
      }
      
      // Try the database query first
      const results = await users.find(query).toArray();
      
      // If we got results, return them
      if (results && results.length > 0) {
        console.log(`UserModel.findByTeamId - found ${results.length} members with direct query`);
        return results;
      }
      
      // Fallback: fetch all members and filter in JavaScript
      // This handles edge cases where teamId might be stored in unexpected formats
      console.log(`UserModel.findByTeamId - direct query returned 0 results, using fallback for teamId: ${teamIdStr}`);
      const allMembers = await users.find({ role: 'member' }).toArray();
      const filteredResults = allMembers.filter(u => {
        if (!u.teamId) return false;
        const memberTeamIdStr = String(u.teamId).trim();
        return memberTeamIdStr === teamIdStr;
      });
      
      console.log(`UserModel.findByTeamId - fallback found ${filteredResults.length} members`);
      return filteredResults;
    } catch (error) {
      console.error('UserModel.findByTeamId error:', error);
      // If query fails, fall back to fetching all and filtering
      try {
        const allMembers = await users.find({ role: 'member' }).toArray();
        const teamIdStr = teamId.toString().trim();
        const filteredResults = allMembers.filter(u => {
          if (!u.teamId) return false;
          const memberTeamIdStr = String(u.teamId).trim();
          return memberTeamIdStr === teamIdStr;
        });
        console.log(`UserModel.findByTeamId - error fallback found ${filteredResults.length} members`);
        return filteredResults;
      } catch (fallbackError) {
        console.error('UserModel.findByTeamId fallback error:', fallbackError);
        return [];
      }
    }
  }


  static async updateShiftSchedule(userId: string, shiftSchedule: ShiftSchedule): Promise<void> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    const objectId = new ObjectId(userId);
    
    // Get current user to check for existing shift schedule
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentUser = await users.findOne({ _id: objectId } as any);
    if (!currentUser) {
      throw new Error('User not found');
    }
    
    // Prepare update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { $set: { shiftSchedule } };
    
    // If user has an existing shift schedule, move it to history
    if (currentUser.shiftSchedule) {
      const newStartDate = new Date(shiftSchedule.startDate);
      newStartDate.setHours(0, 0, 0, 0);
      
      // Calculate end date for previous shift (day before new shift starts)
      const previousEndDate = new Date(newStartDate);
      previousEndDate.setDate(previousEndDate.getDate() - 1);
      previousEndDate.setHours(23, 59, 59, 999);
      
      // Create historical shift entry
      const historicalShift = {
        pattern: currentUser.shiftSchedule.pattern,
        startDate: currentUser.shiftSchedule.startDate,
        endDate: previousEndDate,
        type: currentUser.shiftSchedule.type
      };
      
      // Add to shift history array
      const existingHistory = currentUser.shiftHistory || [];
      update.$set.shiftHistory = [...existingHistory, historicalShift];
    }
    
    // Only store tag for fixed schedules (tags are stable)
    // For rotating schedules, tags change daily and should be regenerated
    if (shiftSchedule.type === 'fixed') {
      const workingDaysTag = generateWorkingDaysTag(shiftSchedule);
      update.$set.workingDaysTag = workingDaysTag;
    } else {
      // For rotating schedules, remove stored tag (will be regenerated on use)
      if (!update.$unset) {
        update.$unset = {};
      }
      update.$unset.workingDaysTag = '';
    }
    
    await users.updateOne(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _id: objectId } as any,
      update
    );
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

  static async createIndexes(): Promise<void> {
    const db = await getDatabase();
    const users = db.collection<User>('users');
    
    try {
      // Create indexes for common query patterns
      await users.createIndex({ teamId: 1 });
      await users.createIndex({ teamId: 1, role: 1 }); // Compound index for team+role queries
      await users.createIndex({ username: 1 }, { unique: true }); // Unique index for username lookups
      console.log('User indexes created successfully');
    } catch (error) {
      console.error('Error creating User indexes:', error);
      // Don't throw - indexes may already exist
    }
  }
}
