'use client';

import { useState, useEffect, useCallback } from 'react';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { LeaveRequest, Team, User } from '@/types';
import {
  SparklesIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// ─── types ────────────────────────────────────────────────────────────────────

interface Block {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  days: number;
  selected: boolean;
}

interface MemberPlan {
  userId: string;
  fullName: string;
  username: string;
  willLose: number;
  blocks: Block[];
  availableCount: number; // days we could actually find
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start === end) return `${months[s.getMonth()]} ${s.getDate()}`;
  if (s.getMonth() === e.getMonth()) return `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
}

function groupConsecutive(days: string[]): Block[] {
  if (!days.length) return [];
  const blocks: Block[] = [];
  let start = days[0];
  let end = days[0];
  let count = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + 'T00:00:00');
    const curr = new Date(days[i] + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      end = days[i];
      count++;
    } else {
      blocks.push({ startDate: start, endDate: end, days: count, selected: true });
      start = days[i];
      end = days[i];
      count = 1;
    }
  }
  blocks.push({ startDate: start, endDate: end, days: count, selected: true });
  return blocks;
}

// ─── algorithm ────────────────────────────────────────────────────────────────

function generatePlan(
  member: User,
  willLose: number,
  poolMemberIds: string[],
  allRequests: LeaveRequest[],
  team: Team
): { days: string[]; available: number } {
  if (!member.shiftSchedule || willLose <= 0) return { days: [], available: 0 };

  const noticePeriod = team.settings.minimumNoticePeriod || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() + noticePeriod + 1);

  const yearEnd = new Date(today.getFullYear(), 11, 31);

  // Pre-build sets for fast lookup
  const memberLeaveSet = new Set<string>();
  const poolLeaveMap = new Map<string, number>(); // date → count on leave from pool

  for (const req of allRequests) {
    if (req.status !== 'approved') continue;
    const uid = String(req.userId);
    const isMember = uid === String(member._id);
    const isPool = poolMemberIds.includes(uid);
    if (!isMember && !isPool) continue;

    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(0, 0, 0, 0);

    for (let d = new Date(reqStart); d <= reqEnd; d.setDate(d.getDate() + 1)) {
      const ymd = toYMD(d);
      if (isMember) memberLeaveSet.add(ymd);
      if (isPool && !isMember) {
        poolLeaveMap.set(ymd, (poolLeaveMap.get(ymd) ?? 0) + 1);
      }
    }
  }

  // Build holiday set
  const holidaySet = new Set<string>();
  if (team.settings.enforceHolidayBlocking && team.settings.holidays) {
    for (const h of team.settings.holidays) holidaySet.add(h.date);
  }

  // Collect all available days
  const available: string[] = [];
  for (let d = new Date(start); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const ymd = toYMD(d);

    if (!isWorkingDay(d, member.shiftSchedule)) continue;
    if (memberLeaveSet.has(ymd)) continue;
    if (holidaySet.has(ymd)) continue;

    // Blackout dates
    const blackout = team.settings.blackoutDates?.some(
      (bd) => ymd >= bd.startDate && ymd <= bd.endDate
    );
    if (blackout) continue;

    // Concurrent leave limit — count pool members already on leave this day
    const onLeave = poolLeaveMap.get(ymd) ?? 0;
    if (onLeave >= team.settings.concurrentLeave) continue;

    available.push(ymd);
  }

  // Spread willLose days evenly across available
  const needed = Math.min(willLose, available.length);
  if (needed === 0) return { days: [], available: available.length };

  const selected: string[] = [];
  if (available.length === needed) {
    selected.push(...available);
  } else {
    const step = available.length / needed;
    for (let i = 0; i < needed; i++) {
      const idx = Math.min(Math.round(i * step), available.length - 1);
      selected.push(available[idx]);
    }
  }

  return { days: selected, available: available.length };
}

// ─── component ────────────────────────────────────────────────────────────────

interface AutoFillModalProps {
  open: boolean;
  onClose: () => void;
  analytics: GroupedTeamAnalytics;
  members: User[];
  allRequests: LeaveRequest[];
  team: Team;
  onApplied: () => void;
}

export default function AutoFillModal({
  open,
  onClose,
  analytics,
  members,
  allRequests,
  team,
  onApplied,
}: AutoFillModalProps) {
  const [plans, setPlans] = useState<MemberPlan[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const buildPlans = useCallback(() => {
    const newPlans: MemberPlan[] = [];

    for (const group of analytics.groups) {
      const poolMemberIds = group.members.map((m) => String(m.userId));

      for (const gm of group.members) {
        const willLose = gm.analytics.willLose ?? 0;
        if (willLose <= 0) continue;

        const user = members.find((m) => String(m._id) === String(gm.userId));
        if (!user) continue;

        const { days, available } = generatePlan(user, Math.ceil(willLose), poolMemberIds, allRequests, team);
        const blocks = groupConsecutive(days);

        newPlans.push({
          userId: String(gm.userId),
          fullName: gm.fullName || gm.username,
          username: gm.username,
          willLose: Math.ceil(willLose),
          blocks,
          availableCount: available,
        });
      }
    }

    setPlans(newPlans);
    setResult(null);
  }, [analytics, members, allRequests, team]);

  useEffect(() => {
    if (open) buildPlans();
  }, [open, buildPlans]);

  function toggleBlock(userId: string, blockIndex: number) {
    setPlans((prev) =>
      prev.map((p) =>
        p.userId === userId
          ? {
              ...p,
              blocks: p.blocks.map((b, i) =>
                i === blockIndex ? { ...b, selected: !b.selected } : b
              ),
            }
          : p
      )
    );
  }

  function regenerate(userId: string) {
    const plan = plans.find((p) => p.userId === userId);
    if (!plan) return;
    const user = members.find((m) => String(m._id) === userId);
    if (!user) return;
    const group = analytics.groups.find((g) => g.members.some((m) => String(m.userId) === userId));
    if (!group) return;
    const poolMemberIds = group.members.map((m) => String(m.userId));
    const { days, available } = generatePlan(user, plan.willLose, poolMemberIds, allRequests, team);
    const blocks = groupConsecutive(days);
    setPlans((prev) =>
      prev.map((p) =>
        p.userId === userId ? { ...p, blocks, availableCount: available } : p
      )
    );
  }

  async function apply() {
    setApplying(true);
    let success = 0;
    let failed = 0;

    const toApply = plans
      .map((p) => ({
        userId: p.userId,
        segments: p.blocks.filter((b) => b.selected).map((b) => ({
          startDate: b.startDate,
          endDate: b.endDate,
        })),
      }))
      .filter((p) => p.segments.length > 0);

    for (const item of toApply) {
      try {
        const res = await fetch('/api/leave-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Annual leave (auto-scheduled)',
            segments: item.segments,
            requestedFor: item.userId,
          }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setApplying(false);
    setResult({ success, failed });
    if (success > 0) onApplied();
  }

  const totalSelected = plans.reduce(
    (sum, p) => sum + p.blocks.filter((b) => b.selected).reduce((s, b) => s + b.days, 0),
    0
  );
  const membersWithSelections = plans.filter((p) => p.blocks.some((b) => b.selected)).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
              <SparklesIcon className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Auto-fill Leave</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Suggested leave blocks spread across the year — review and apply for each member.
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Summary bar */}
          {plans.length > 0 && !result && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {plans.length} member{plans.length !== 1 ? 's' : ''} at risk ·
              </span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {totalSelected} day{totalSelected !== 1 ? 's' : ''} selected across {membersWithSelections} member{membersWithSelections !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Success/failure result */}
          {result && (
            <div className={`rounded-xl p-4 flex items-start gap-3 ${result.failed === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50'}`}>
              {result.failed === 0
                ? <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                : <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {result.success} of {result.success + result.failed} members scheduled
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {result.failed === 0
                    ? 'Leave blocks sent to members for consent. They will need to accept before the days are confirmed.'
                    : `${result.failed} failed — they may already have leave or a policy conflict. Check manually.`}
                </p>
              </div>
            </div>
          )}

          {plans.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircleIcon className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No members at risk</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Everyone&apos;s balance is on track.</p>
            </div>
          )}

          {/* Member plans */}
          {!result && plans.map((plan) => {
            const selectedDays = plan.blocks.filter((b) => b.selected).reduce((s, b) => s + b.days, 0);
            const shortfall = plan.willLose - plan.availableCount;

            return (
              <div key={plan.userId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {/* Member header */}
                <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 text-[11px] font-bold text-orange-700 dark:text-orange-300">
                      {(plan.fullName || plan.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {plan.fullName || plan.username}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {plan.willLose}d at risk
                        {shortfall > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">
                            · only {plan.availableCount} slot{plan.availableCount !== 1 ? 's' : ''} available
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {selectedDays}/{plan.willLose}d selected
                    </span>
                    <button
                      type="button"
                      onClick={() => regenerate(plan.userId)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      title="Regenerate suggestions"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Blocks */}
                <div className="px-4 py-3">
                  {plan.blocks.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                      No available slots found — team may be fully booked or the year is almost over.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.blocks.map((block, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleBlock(plan.userId, i)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                            block.selected
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300'
                              : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 line-through'
                          }`}
                        >
                          {formatRange(block.startDate, block.endDate)}
                          {block.days > 1 && (
                            <span className={`text-[10px] ${block.selected ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400'}`}>
                              · {block.days}d
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          {result ? (
            <button onClick={onClose} className="btn-primary text-sm px-4 py-2">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button
                onClick={apply}
                disabled={applying || totalSelected === 0}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Apply {totalSelected} day{totalSelected !== 1 ? 's' : ''} for {membersWithSelections} member{membersWithSelections !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
