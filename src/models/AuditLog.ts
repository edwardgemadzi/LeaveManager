import { getDatabase, getDatabaseRaw } from '@/lib/mongodb';

export interface AuditLog {
  _id?: string;
  action: 'leave_approved' | 'leave_rejected' | 'leave_created' | 'leave_updated' | 'leave_deleted' | 'team_settings_updated' | 'user_registered';
  userId: string;
  userName: string;
  userRole: 'leader' | 'member';
  teamId: string;
  targetUserId?: string; // For actions on behalf of others
  targetUserName?: string;
  details: Record<string, unknown>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogModel {
  static async create(logData: Omit<AuditLog, '_id' | 'timestamp'>): Promise<AuditLog> {
    const db = await getDatabase();
    const auditLogs = db.collection<AuditLog>('auditLogs');
    
    const auditLog: AuditLog = {
      ...logData,
      timestamp: new Date(),
    };
    
    const result = await auditLogs.insertOne(auditLog);
    return { ...auditLog, _id: result.insertedId.toString() };
  }

  static async findByTeamId(teamId: string, limit = 100): Promise<AuditLog[]> {
    const db = await getDatabase();
    const auditLogs = db.collection<AuditLog>('auditLogs');
    
    return await auditLogs
      .find({ teamId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  static async findByUserId(userId: string, limit = 50): Promise<AuditLog[]> {
    const db = await getDatabase();
    const auditLogs = db.collection<AuditLog>('auditLogs');
    
    return await auditLogs
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  static async findByUserIdInTeam(userId: string, teamId: string, limit = 50): Promise<AuditLog[]> {
    const db = await getDatabase();
    const auditLogs = db.collection<AuditLog>('auditLogs');

    return await auditLogs
      .find({ userId, teamId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  static async createIndexes(): Promise<void> {
    const db = await getDatabaseRaw();
    const auditLogs = db.collection<AuditLog>('auditLogs');

    try {
      // Compound indexes for filter + newest-first sort query patterns.
      await auditLogs.createIndex({ teamId: 1, timestamp: -1 });
      await auditLogs.createIndex({ userId: 1, timestamp: -1 });
      console.log('AuditLog indexes created successfully');
    } catch (error) {
      console.error('Error creating AuditLog indexes:', error);
      // Don't throw - indexes may already exist
    }
  }

  static async logLeaveAction(
    action: 'leave_approved' | 'leave_rejected' | 'leave_deleted',
    actorId: string,
    actorName: string,
    actorRole: 'leader' | 'member',
    teamId: string,
    targetUserId: string,
    targetUserName: string,
    leaveRequestId: string,
    leaveDetails: {
      startDate: string;
      endDate: string;
      reason: string;
      status?: string;
      decisionNote?: string;
    },
    additionalDetails?: Record<string, unknown>
  ): Promise<void> {
    await this.create({
      action,
      userId: actorId,
      userName: actorName,
      userRole: actorRole,
      teamId,
      targetUserId,
      targetUserName,
      details: {
        leaveRequestId,
        ...leaveDetails,
        ...additionalDetails,
      },
    });
  }

  static async logLeaveCreation(
    userId: string,
    userName: string,
    userRole: 'leader' | 'member',
    teamId: string,
    leaveRequestId: string,
    leaveDetails: {
      startDate: string;
      endDate: string;
      reason: string;
    },
    requestedFor?: string
  ): Promise<void> {
    await this.create({
      action: 'leave_created',
      userId,
      userName,
      userRole,
      teamId,
      targetUserId: requestedFor,
      details: {
        leaveRequestId,
        ...leaveDetails,
        requestedFor: !!requestedFor,
      },
    });
  }

  static async logTeamSettingsUpdate(
    userId: string,
    userName: string,
    teamId: string,
    oldSettings: Record<string, unknown>,
    newSettings: Record<string, unknown>
  ): Promise<void> {
    await this.create({
      action: 'team_settings_updated',
      userId,
      userName,
      userRole: 'leader',
      teamId,
      details: {
        oldSettings,
        newSettings,
        changes: this.getSettingsChanges(oldSettings, newSettings),
      },
    });
  }

  private static getSettingsChanges(
    oldSettings: Record<string, unknown>,
    newSettings: Record<string, unknown>
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    
    for (const key in newSettings) {
      if (oldSettings[key] !== newSettings[key]) {
        changes[key] = {
          from: oldSettings[key],
          to: newSettings[key],
        };
      }
    }
    
    return changes;
  }
}
