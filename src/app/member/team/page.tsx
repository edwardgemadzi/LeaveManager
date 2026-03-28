'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { User, Team, LeaveRequest } from '@/types';
import { detectPartialOverlap, generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { useRequests } from '@/hooks/useRequests';
import {
  UsersIcon,
  SunIcon,
  MoonIcon,
  ArrowsRightLeftIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// ─── constants ───────────────────────────────────────────────────────────────

const DAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function shiftTagMeta(tag?: string) {
  if (tag === 'day')
    return {
      label: 'Day shift',
      color: 'text-amber-600 dark:text-amber-400',
      muted: 'text-amber-500/70 dark:text-amber-500/60',
      bg: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30',
      border: 'border-amber-200/80 dark:border-amber-800/40',
      activeDay: 'bg-amber-500 dark:bg-amber-400',
      inactiveDay: 'bg-amber-200/50 dark:bg-amber-900/40',
      iconWrap: 'bg-amber-100 dark:bg-amber-900/50',
      Icon: SunIcon,
    };
  if (tag === 'night')
    return {
      label: 'Night shift',
      color: 'text-indigo-600 dark:text-indigo-400',
      muted: 'text-indigo-500/70 dark:text-indigo-500/60',
      bg: 'bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30',
      border: 'border-indigo-200/80 dark:border-indigo-800/40',
      activeDay: 'bg-indigo-500 dark:bg-indigo-400',
      inactiveDay: 'bg-indigo-200/50 dark:bg-indigo-900/40',
      iconWrap: 'bg-indigo-100 dark:bg-indigo-900/50',
      Icon: MoonIcon,
    };
  if (tag === 'mixed')
    return {
      label: 'Mixed shift',
      color: 'text-violet-600 dark:text-violet-400',
      muted: 'text-violet-500/70 dark:text-violet-500/60',
      bg: 'bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/30',
      border: 'border-violet-200/80 dark:border-violet-800/40',
      activeDay: 'bg-violet-500 dark:bg-violet-400',
      inactiveDay: 'bg-violet-200/50 dark:bg-violet-900/40',
      iconWrap: 'bg-violet-100 dark:bg-violet-900/50',
      Icon: ArrowsRightLeftIcon,
    };
  return {
    label: 'No shift type',
    color: 'text-zinc-500 dark:text-zinc-400',
    muted: 'text-zinc-400 dark:text-zinc-500',
    bg: 'bg-zinc-50 dark:bg-zinc-800/50',
    border: 'border-zinc-200 dark:border-zinc-700',
    activeDay: 'bg-zinc-400 dark:bg-zinc-500',
    inactiveDay: 'bg-zinc-200 dark:bg-zinc-700',
    iconWrap: 'bg-zinc-100 dark:bg-zinc-800',
    Icon: UsersIcon,
  };
}

function isComplementarySchedule(
  s1: import('@/types').ShiftSchedule | undefined,
  s2: import('@/types').ShiftSchedule | undefined,
  days = 30
): boolean {
  if (!s1 || !s2) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let s2Works = false;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (isWorkingDay(d, s1) && isWorkingDay(d, s2)) return false;
    if (isWorkingDay(d, s2)) s2Works = true;
  }
  return s2Works;
}

function getMemberGroupKey(member: User, enableSubgrouping: boolean): string {
  const subgroupKey = enableSubgrouping ? (member.subgroupTag || 'Ungrouped') : 'All';
  const workingDaysTag =
    member.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(member.shiftSchedule)
      : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule) || 'no-schedule');
  const shiftTag = member.shiftTag || 'no-tag';
  return `${subgroupKey}_${shiftTag}_${workingDaysTag}`;
}

function initials(m: User) {
  const name = m.fullName || m.username || '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function displayName(m: User) {
  return m.fullName || m.username;
}

// ─── leave status helper ──────────────────────────────────────────────────────

type LeaveStatus = 'on_leave' | 'soon' | null;

function getLeaveStatus(memberId: string, requests: LeaveRequest[]): { status: LeaveStatus; startDate?: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  let soonest: Date | null = null;

  for (const req of requests) {
    if (req.status !== 'approved') continue;
    if (String(req.userId) !== String(memberId)) continue;
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    // Currently on leave
    if (start <= today && end >= today) return { status: 'on_leave', startDate: start };
    // Leave starting within this calendar month
    if (start > today && start <= endOfMonth) {
      if (!soonest || start < soonest) soonest = start;
    }
  }
  if (soonest) return { status: 'soon', startDate: soonest };
  return { status: null };
}

// Mini pattern visualization — shows today + next 3 days for any schedule type
function MiniPattern({ member }: { member: User }) {
  const s = member.shiftSchedule;
  const meta = shiftTagMeta(member.shiftTag);
  if (!s) return <span className="text-[10px] text-zinc-400">No schedule</span>;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const blocks = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);

    let on: boolean;
    if (s.type === 'rotating') {
      const cycleStart = new Date(s.startDate);
      cycleStart.setHours(0, 0, 0, 0);
      const daysSince = Math.floor((d.getTime() - cycleStart.getTime()) / 86400000);
      const idx = ((daysSince % s.pattern.length) + s.pattern.length) % s.pattern.length;
      on = s.pattern[idx] ?? false;
    } else {
      const jsDay = d.getDay();
      const patIdx = jsDay === 0 ? 6 : jsDay - 1;
      on = s.pattern[patIdx] ?? false;
    }

    return { on, isToday: offset === 0 };
  });

  return (
    <div className="flex items-center gap-0.5">
      {blocks.map(({ on, isToday }, i) => (
        <span
          key={i}
          className={`rounded-sm transition-all ${on ? meta.activeDay : meta.inactiveDay} ${isToday ? 'w-2.5 h-5' : 'w-2 h-3.5'}`}
        />
      ))}
    </div>
  );
}

// ─── schedule hero card ───────────────────────────────────────────────────────

function ScheduleHero({ user }: { user: User }) {
  const s = user.shiftSchedule;
  const meta = shiftTagMeta(user.shiftTag);
  const Icon = meta.Icon;
  const workingDays = s?.type === 'fixed' ? s.pattern.slice(0, 7).filter(Boolean).length : null;

  return (
    <div className={`rounded-2xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">

        {/* Shift identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className={`w-11 h-11 rounded-xl ${meta.iconWrap} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${meta.color}`} />
          </div>
          <div>
            <p className={`text-base font-bold leading-tight ${meta.color}`}>{meta.label}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {s ? (s.type === 'rotating' ? 'Rotating' : 'Fixed') : 'No schedule'}
              {user.subgroupTag && <> · <span className="font-medium text-indigo-600 dark:text-indigo-400">{user.subgroupTag}</span></>}
            </p>
          </div>
        </div>

        {/* Visual pattern — always shows today + next 3 days */}
        <div className="flex-1">
          {s && (() => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            // For each offset 0-3, determine if that day is a working day
            const upcoming = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
              const d = new Date(now);
              d.setDate(now.getDate() + offset);

              let on: boolean;
              if (s.type === 'rotating') {
                const cycleStart = new Date(s.startDate);
                cycleStart.setHours(0, 0, 0, 0);
                const daysSince = Math.floor((d.getTime() - cycleStart.getTime()) / 86400000);
                const idx = ((daysSince % s.pattern.length) + s.pattern.length) % s.pattern.length;
                on = s.pattern[idx] ?? false;
              } else {
                // fixed: pattern[0]=Mon … pattern[6]=Sun
                const jsDay = d.getDay(); // 0=Sun
                const patIdx = jsDay === 0 ? 6 : jsDay - 1;
                on = s.pattern[patIdx] ?? false;
              }

              const label = offset === 0
                ? 'Today'
                : d.toLocaleDateString(undefined, { weekday: 'short' });

              return { on, label, offset };
            });

            return (
              <div className="flex items-end gap-3">
                {/* 4-day blocks */}
                <div className="flex gap-2 items-end">
                  {upcoming.map(({ on, label, offset }) => (
                    <div key={offset} className="flex flex-col items-center gap-1">
                      <span className={`text-[10px] font-bold leading-none ${offset === 0 ? meta.color : 'text-zinc-400 dark:text-zinc-600'}`}>
                        {label}
                      </span>
                      <span
                        className={`rounded-md transition-all ${on ? meta.activeDay : meta.inactiveDay} ${offset === 0 ? 'w-6 h-10' : 'w-5 h-7'}`}
                      />
                      {/* dot under today */}
                      {offset === 0
                        ? <span className={`w-1.5 h-1.5 rounded-full ${meta.activeDay}`} />
                        : <span className="w-1.5 h-1.5" />
                      }
                    </div>
                  ))}
                </div>

                {/* Cycle stats (rotating only) */}
                {s.type === 'rotating' && (
                  <div className="mb-2">
                    <p className={`text-sm font-semibold leading-tight ${meta.color}`}>
                      {s.pattern.filter(Boolean).length} on · {s.pattern.filter(b => !b).length} off
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {s.pattern.length}-day cycle
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          {!s && <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No schedule assigned</p>}
        </div>

        {/* Stats */}
        <div className="flex sm:flex-col gap-4 sm:gap-1.5 shrink-0">
          {workingDays !== null && (
            <div className="text-center">
              <p className={`text-xl font-bold leading-none ${meta.color}`}>{workingDays}</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">days/wk</p>
            </div>
          )}
          {s?.type === 'rotating' && (
            <div className="text-center">
              <p className={`text-xl font-bold leading-none ${meta.color}`}>{s.pattern.length}</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-0.5 justify-center">
                <ArrowPathIcon className="h-2.5 w-2.5" />cycle
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── member card (colleague grid) ────────────────────────────────────────────

function LeavePill({ status, startDate }: { status: LeaveStatus; startDate?: Date }) {
  if (!status) return null;
  if (status === 'on_leave') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400">
      On leave
    </span>
  );
  const label = startDate
    ? `Leave ${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : 'Leave soon';
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400">
      {label}
    </span>
  );
}

function MemberCard({ member, leaveStatus, leaveDate }: { member: User; leaveStatus: LeaveStatus; leaveDate?: Date }) {
  const meta = shiftTagMeta(member.shiftTag);
  const Icon = meta.Icon;
  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm transition-all">
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full ${meta.iconWrap} flex items-center justify-center shrink-0 text-xs font-bold ${meta.color}`}>
        {initials(member)}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
          {displayName(member)}
        </p>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <MiniPattern member={member} />
          <LeavePill status={leaveStatus} startDate={leaveDate} />
        </div>
      </div>
      {/* Shift badge */}
      <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${meta.bg} border ${meta.border} ${meta.color}`}>
        <Icon className="h-2.5 w-2.5" />{meta.label.split(' ')[0]}
      </span>
    </div>
  );
}

// ─── swap candidate row (richer) ─────────────────────────────────────────────

function SwapRow({ member, bestMatch, leaveStatus, leaveDate }: { member: User; bestMatch?: boolean; leaveStatus: LeaveStatus; leaveDate?: Date }) {
  const meta = shiftTagMeta(member.shiftTag);
  const Icon = meta.Icon;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
      <div className={`w-8 h-8 rounded-full ${meta.iconWrap} flex items-center justify-center shrink-0 text-[11px] font-bold ${meta.color}`}>
        {initials(member)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">
          {displayName(member)}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <MiniPattern member={member} />
          <LeavePill status={leaveStatus} startDate={leaveDate} />
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {bestMatch && (
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.5 rounded-md">
            Best match
          </span>
        )}
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${meta.bg} border ${meta.border} ${meta.color}`}>
          <Icon className="h-2.5 w-2.5" />{meta.label.split(' ')[0]}
        </span>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function MemberTeamPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [members,     setMembers]     = useState<User[]>([]);
  const [team,        setTeam]        = useState<Team | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const { data: teamRequests } = useRequests({
    fields: ['_id', 'userId', 'startDate', 'endDate', 'status'],
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/team');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCurrentUser(data.currentUser ?? null);
        setMembers(data.members ?? []);
        setTeam(data.team ?? null);
      } catch {
        setError('Could not load team data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const { colleagues, complementary, partialOverlap } = useMemo(() => {
    if (!currentUser || !team) return { colleagues: [], complementary: [], partialOverlap: [] };

    const enableSubgrouping = team.settings?.enableSubgrouping ?? false;
    const myGroupKey = getMemberGroupKey(currentUser, enableSubgrouping);
    const others = members.filter((m) => String(m._id) !== String(currentUser._id));

    const colleagues:     User[] = [];
    const complementary:  User[] = [];
    const partialOverlap: User[] = [];

    for (const m of others) {
      if (getMemberGroupKey(m, enableSubgrouping) === myGroupKey) {
        colleagues.push(m);
        continue;
      }
      if (isComplementarySchedule(currentUser.shiftSchedule, m.shiftSchedule, 30)) {
        complementary.push(m);
      } else if (detectPartialOverlap(currentUser.shiftSchedule, m.shiftSchedule, 30)) {
        partialOverlap.push(m);
      }
    }

    return { colleagues, complementary, partialOverlap };
  }, [currentUser, members, team]);

  return (
    <ProtectedRoute requiredRole="member">
      <Navbar />
      <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-zinc-50 dark:bg-zinc-950 lg:pl-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-28 lg:pt-8 lg:pb-6 space-y-4 lg:space-y-0 lg:flex lg:flex-col lg:h-full lg:gap-4">

          {/* Page header */}
          <div className="flex items-baseline justify-between lg:shrink-0">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">My Team</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Your schedule and who you work with</p>
            </div>
            {!loading && currentUser && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-4 lg:shrink-0">
              <div className="h-20 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="grid lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => <div key={i} className="h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />)}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Main content */}
          {!loading && !error && currentUser && (
            <>
              {/* Schedule hero — full width */}
              <div className="lg:shrink-0">
                <ScheduleHero user={currentUser} />
              </div>

              {/* Three-panel row */}
              <div className="grid lg:grid-cols-3 gap-4 lg:items-start lg:flex-1 lg:min-h-0">

                {/* ── Colleagues ── */}
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[420px] lg:max-h-none lg:h-full">
                  <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Working With You</p>
                    </div>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-medium">
                      {colleagues.length}
                    </span>
                  </div>
                  {colleagues.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-center text-zinc-400 dark:text-zinc-500">No one shares your exact schedule.</p>
                  ) : (
                    <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {colleagues.map((m) => {
                        const { status, startDate } = getLeaveStatus(String(m._id), teamRequests ?? []);
                        return <SwapRow key={String(m._id)} member={m} leaveStatus={status} leaveDate={startDate} />;
                      })}
                    </div>
                  )}
                </div>

                {/* ── Opposite schedule (best match) ── */}
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[420px] lg:max-h-none lg:h-full">
                  <div className="px-4 py-3 border-b border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowsRightLeftIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Opposite Schedule</p>
                    </div>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full font-medium">
                      {complementary.length}
                    </span>
                  </div>
                  {complementary.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-center text-zinc-400 dark:text-zinc-500">No one works your exact off days.</p>
                  ) : (
                    <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {complementary.map((m) => {
                        const { status, startDate } = getLeaveStatus(String(m._id), teamRequests ?? []);
                        return <SwapRow key={String(m._id)} member={m} bestMatch leaveStatus={status} leaveDate={startDate} />;
                      })}
                    </div>
                  )}
                </div>

                {/* ── Shared days ── */}
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[420px] lg:max-h-none lg:h-full">
                  <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowsRightLeftIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Shared Days</p>
                    </div>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-medium">
                      {partialOverlap.length}
                    </span>
                  </div>
                  {partialOverlap.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-center text-zinc-400 dark:text-zinc-500">No one shares working days with you.</p>
                  ) : (
                    <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {partialOverlap.map((m) => {
                        const { status, startDate } = getLeaveStatus(String(m._id), teamRequests ?? []);
                        return <SwapRow key={String(m._id)} member={m} leaveStatus={status} leaveDate={startDate} />;
                      })}
                    </div>
                  )}
                </div>

              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
