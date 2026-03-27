'use client';

import { useMemo } from 'react';
import { XMarkIcon, ScaleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';

interface AllocationModalProps {
  open: boolean;
  onClose: () => void;
  analytics: GroupedTeamAnalytics;
}

export default function AllocationModal({ open, onClose, analytics }: AllocationModalProps) {
  const groupsWithConflict = useMemo(() => {
    return analytics.groups
      .map((g) => {
        // Days that will actually be lost in this group (the real allocation problem)
        const groupWillLose = g.members.reduce((s, m) => s + (m.analytics.willLose ?? 0), 0);
        const groupBalance = g.aggregate.groupTotalLeaveBalance;
        const groupRealistic = g.aggregate.groupTotalRealisticUsableDays;

        // Members ranked by who needs priority most:
        // 1. Highest willLose (most at risk) first
        // 2. Then lowest realisticUsableDays/remainingLeaveBalance ratio (worst efficiency)
        const ranked = g.members
          .filter((m) => m.analytics.remainingLeaveBalance > 0)
          .map((m) => {
            const efficiency =
              m.analytics.remainingLeaveBalance > 0
                ? m.analytics.realisticUsableDays / m.analytics.remainingLeaveBalance
                : 1;
            return { ...m, _efficiency: efficiency };
          })
          .sort((a, b) => {
            const aLose = a.analytics.willLose ?? 0;
            const bLose = b.analytics.willLose ?? 0;
            if (aLose !== bLose) return bLose - aLose;
            return a._efficiency - b._efficiency;
          });

        // Members with zero balance shown last
        const zeroBalance = g.members.filter((m) => m.analytics.remainingLeaveBalance <= 0);
        const members = [
          ...ranked.map((m) => ({ ...m, recommended: (m.analytics.willLose ?? 0) > 0 })),
          ...zeroBalance.map((m) => ({ ...m, _efficiency: 1, recommended: false })),
        ];

        return { ...g, groupWillLose, groupBalance, groupRealistic, members };
      })
      .filter((g) => g.groupWillLose > 0);
  }, [analytics]);

  const totalAtRisk = groupsWithConflict.reduce((s, g) => s + g.groupWillLose, 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[82vh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <ScaleIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Allocation Decisions</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {groupsWithConflict.length === 0
                  ? 'No conflicts right now'
                  : `${Math.round(totalAtRisk)} days at risk · ${groupsWithConflict.length} group${groupsWithConflict.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Info banner */}
        <div className="shrink-0 mx-5 mt-4 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 flex gap-2.5">
          <InformationCircleIcon className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-800 dark:text-orange-300 leading-relaxed">
            These groups have more leave balance than the schedule can accommodate. Someone must sacrifice days.
            Prioritise approving leave for the highlighted members first to minimise loss.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {groupsWithConflict.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <ScaleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">All groups are balanced</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">No members are currently at risk of losing days.</p>
            </div>
          ) : (
            groupsWithConflict.map((group) => (
              <div key={group.groupKey} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">

                {/* Group header */}
                <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                        {group.subgroupTag ? `${group.subgroupTag} · ` : ''}
                        {group.workingDaysTag}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {group.aggregate.groupTotalMembers} member{group.aggregate.groupTotalMembers !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold">
                      {Math.round(group.groupWillLose)} day{group.groupWillLose !== 1 ? 's' : ''} at risk
                    </span>
                  </div>

                  {/* Group capacity bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{
                          width: `${Math.min(100, group.groupBalance > 0 ? (group.groupRealistic / group.groupBalance) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
                      {Math.round(group.groupRealistic)}/{Math.round(group.groupBalance)} days usable
                    </span>
                  </div>
                </div>

                {/* Members */}
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {group.members.map((member) => {
                    const ma = member.analytics;
                    const willLose = ma.willLose ?? 0;
                    const hasNoBalance = ma.remainingLeaveBalance <= 0;

                    return (
                      <div
                        key={member.userId}
                        className={`px-4 py-3 flex items-center gap-3 ${member.recommended ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}
                      >
                        {/* Avatar */}
                        <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                            {(member.fullName || member.username || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${hasNoBalance ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {member.fullName || member.username}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                              {Math.round(ma.remainingLeaveBalance)} days left
                            </span>
                            {!hasNoBalance && (
                              <>
                                <span className="text-[10px] text-zinc-300 dark:text-zinc-600">·</span>
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                  {Math.round(ma.realisticUsableDays)} realistic
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Badge */}
                        {willLose > 0 ? (
                          <div className="shrink-0 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold">
                              {Math.round(willLose)}d at risk
                            </span>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">prioritise</p>
                          </div>
                        ) : hasNoBalance ? (
                          <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 italic">no balance</span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-green-600 dark:text-green-400 font-medium">safe</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed">
            Prioritise leave approvals for members marked at risk · decisions applied via requests page
          </p>
        </div>
      </div>
    </div>
  );
}
