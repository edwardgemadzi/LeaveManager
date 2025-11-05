import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';

/**
 * Initialize all database indexes for optimal query performance.
 * This should be called once on application startup.
 */
export async function initializeDatabaseIndexes(): Promise<void> {
  try {
    console.log('Initializing database indexes...');
    
    // Create indexes for all models in parallel
    await Promise.all([
      LeaveRequestModel.createIndexes(),
      UserModel.createIndexes(),
      TeamModel.createIndexes(),
    ]);
    
    console.log('Database indexes initialized successfully');
  } catch (error) {
    console.error('Error initializing database indexes:', error);
    // Don't throw - allow app to continue even if index creation fails
  }
}

