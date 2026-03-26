import { LeaveRequestModel } from '@/models/LeaveRequest';
import { UserModel } from '@/models/User';
import { TeamModel } from '@/models/Team';
import { AuditLogModel } from '@/models/AuditLog';
import { TelegramLinkTokenModel } from '@/models/TelegramLinkToken';
import { MagicLinkModel } from '@/models/MagicLink';
import { PasswordResetTokenModel } from '@/models/PasswordResetToken';
import { TeamPolicyVersionModel } from '@/models/TeamPolicyVersion';

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
      AuditLogModel.createIndexes(),
      TelegramLinkTokenModel.createIndexes(),
      MagicLinkModel.createIndexes(),
      PasswordResetTokenModel.createIndexes(),
      TeamPolicyVersionModel.createIndexes(),
    ]);
    
    console.log('Database indexes initialized successfully');
  } catch (error) {
    console.error('Error initializing database indexes:', error);
    // Don't throw - allow app to continue even if index creation fails
  }
}

