import type { User, LeaveRequest, Team } from '@/types';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { parseDateSafe } from '@/lib/dateUtils';

/** All members (role `member`) — leader staffing view across the full team. */
export function filterTeamMemberPeers(members: User[]): User[] {
  return members.filter((m) => m.role === 'member');
}

/** Members in the same planning cohort (subgroup when enabled). */
export function filterPlanningPeers(members: User[], currentUser: User, team: Team): User[] {
  const membersOnly = members.filter((m) => m.role === 'member');
  if (!team.settings.enableSubgrouping) return membersOnly;
  const u = currentUser.subgroupTag || 'Ungrouped';
  return membersOnly.filter((m) => (m.subgroupTag || 'Ungrouped') === u);
}

export function isOnApprovedLeaveDay(userId: string, day: Date, approvedRequests: LeaveRequest[]): boolean {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const t = dayStart.getTime();
  return approvedRequests.some((req) => {
    if (String(req.userId) !== String(userId)) return false;
    const s = parseDateSafe(req.startDate);
    const e = parseDateSafe(req.endDate);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return t >= s.getTime() && t <= e.getTime();
  });
}

export function countScheduledPeersOnDay(day: Date, peers: User[]): number {
  return peers.filter((m) => isWorkingDay(day, m)).length;
}

export function countPeersWorkingOnDay(day: Date, peers: User[], approvedRequests: LeaveRequest[]): number {
  let n = 0;
  for (const m of peers) {
    if (!m._id) continue;
    if (!isWorkingDay(day, m)) continue;
    if (isOnApprovedLeaveDay(m._id, day, approvedRequests)) continue;
    n++;
  }
  return n;
}

export type HeadcountDay = {
  date: Date;
  scheduled: number;
  working: number;
  onLeave: number;
};

/** One row per calendar day for the next 7 days (from today, local midnight). */
export function buildHeadcountWeekForPeers(peers: User[], approvedRequests: LeaveRequest[]): HeadcountDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const scheduled = countScheduledPeersOnDay(d, peers);
    const working = countPeersWorkingOnDay(d, peers, approvedRequests);
    const onLeave = Math.max(0, scheduled - working);
    return { date: d, scheduled, working, onLeave };
  });
}

export function filterPeersBySubgroupLabel(peers: User[], subgroupLabel: string): User[] {
  return peers.filter((m) => (m.subgroupTag || 'Ungrouped') === subgroupLabel);
}

export function uniqueSubgroupLabelsFromPeers(peers: User[]): string[] {
  const labels = new Set(peers.map((p) => p.subgroupTag || 'Ungrouped'));
  return Array.from(labels).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
