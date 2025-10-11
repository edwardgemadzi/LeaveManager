export interface User {
  _id?: string;
  username: string;
  fullName?: string;
  password: string;
  role: 'leader' | 'member';
  teamId?: string;
  shiftSchedule?: ShiftSchedule;
  shiftTag?: 'day' | 'night' | 'mixed'; // New field for shift categorization
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
}

export interface CreateLeaveRequest {
  startDate: string;
  endDate: string;
  reason: string;
  requestedFor?: string; // For leaders making requests on behalf
}
