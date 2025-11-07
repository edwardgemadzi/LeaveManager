export interface User {
  _id?: string;
  username: string;
  fullName?: string;
  password: string;
  role: 'leader' | 'member';
  teamId?: string;
  shiftSchedule?: ShiftSchedule;
  shiftHistory?: Array<{ pattern: boolean[]; startDate: Date; endDate: Date; type: 'rotating' | 'fixed' }>; // Historical shift schedules
  shiftTag?: 'day' | 'night' | 'mixed'; // New field for shift categorization
  workingDaysTag?: string; // Automatic tag grouping members who work on exactly the same days
  subgroupTag?: string; // Custom subgroup name assigned by leader (only when enableSubgrouping is true)
  manualLeaveBalance?: number; // Manual leave balance override set by leader (for members joining mid-year)
  manualYearToDateUsed?: number; // Manual year-to-date used days override set by leader
  manualMaternityLeaveBalance?: number; // Manual maternity leave balance override
  manualMaternityYearToDateUsed?: number; // Manual maternity year-to-date used days override
  maternityPaternityType?: 'maternity' | 'paternity' | null; // Type of parental leave assigned by leader
  createdAt: Date;
}

export interface Team {
  _id?: string;
  name: string;
  teamUsername: string;
  leaderId: string;
  settings: TeamSettings;
  createdAt: Date;
}

export interface TeamSettings {
  concurrentLeave: number;
  maxLeavePerYear: number;
  minimumNoticePeriod: number; // Minimum days in advance for leave requests
  allowCarryover?: boolean; // Whether unused leave days can carry over to next year
  carryoverSettings?: {
    limitedToMonths?: number[]; // Array of month indices (0-11) where carryover can be used (e.g., [0] for January only)
    maxCarryoverDays?: number; // Maximum days that can carry over
    expiryDate?: Date; // Date when carryover days expire
  };
  enableSubgrouping?: boolean; // Whether to enable subgroup organization within the team
  subgroups?: string[]; // List of predefined subgroup names (minimum 2 required if enableSubgrouping is true)
  workingDaysGroupNames?: Record<string, string>; // Custom names for working days pattern groups (e.g., {"MTWTF__": "Weekday Team"})
  bypassNoticePeriod?: {
    enabled: boolean;
    startDate?: Date;
    endDate?: Date;
  };
  maternityLeave?: {
    enabled?: boolean; // Whether maternity leave is enabled for the team (default: false)
    maxDays?: number; // Maximum maternity leave days (configurable by leader, default: 90)
    countingMethod?: 'calendar' | 'working'; // How to count days: 'calendar' = count all calendar days, 'working' = count only working days (default: 'working')
  };
  paternityLeave?: {
    enabled?: boolean; // Whether paternity leave is enabled for the team (default: false)
    maxDays?: number; // Maximum paternity leave days (configurable by leader, default: 90)
    countingMethod?: 'calendar' | 'working'; // How to count days: 'calendar' = count all calendar days, 'working' = count only working days (default: 'working')
  };
}

export interface LeaveRequest {
  _id?: string;
  userId: string;
  teamId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy?: string; // For leader requests on behalf of members
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftSchedule {
  pattern: boolean[]; // true = working day, false = off day
  startDate: Date;
  type: 'rotating' | 'fixed';
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterLeaderRequest {
  username: string;
  fullName: string;
  password: string;
  teamName: string;
  teamUsername: string;
}

export interface RegisterMemberRequest {
  username: string;
  fullName: string;
  password: string;
  teamUsername: string;
  shiftSchedule: ShiftSchedule;
  maternityPaternityType?: 'maternity' | 'paternity' | null;
}

export interface CreateLeaveRequest {
  startDate: string;
  endDate: string;
  reason: string;
  requestedFor?: string; // For leaders making requests on behalf
  isHistorical?: boolean; // For migration: allows past dates and auto-approves
}
