'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { useDashboardData } from '@/hooks/useDashboardData';
import { parseDateSafe } from '@/lib/dateUtils';
import {
  filterTeamMemberPeers,
  buildHeadcountWeekForPeers,
  uniqueSubgroupLabelsFromPeers,
  filterPeersBySubgroupLabel,
} from '@/lib/teamHeadcount';
import { calculateTimeBasedTeamHealthScore } from '@/lib/helpers';
import { ProgressRing } from '@/components/shared/ProgressRing';
import { Sparkline } from '@/components/shared/Sparkline';
import { Timeline } from '@/components/shared/Timeline';
import {
  UsersIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  BuildingOffice2Icon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import DecisionModal, { DecisionType } from '@/components/shared/DecisionModal';
import AllocationModal from '@/components/shared/AllocationModal';

export default function LeaderDashboard() {
  const { showNotification } = useBrowserNotification();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);

  // Decision modal state
  const [decisionModal, setDecisionModal] = useState<{
    open: boolean;
    type: DecisionType;
    requestId: string | null;
  }>({ open: false, type: 'approve', requestId: null });
  const [allocationOpen, setAllocationOpen] = useState(false);
  
  // Refs to track notification state and prevent duplicates
  const previousPendingRequestsRef = useRef<LeaveRequest[]>([]);
  const membersAtRiskNotifiedRef = useRef(false);

  const { data: dashboardData, mutate: mutateDashboard, isLoading: dashboardLoading } = useDashboardData({
    include: ['team', 'members', 'requests', 'analytics', 'currentUser'],
    requestFields: ['_id', 'userId', 'startDate', 'endDate', 'reason', 'status', 'decisionNote', 'decisionAt', 'decisionByUsername', 'createdAt', 'requestedBy'],
  });

  const handleApprove = (requestId: string) => {
    setDecisionModal({ open: true, type: 'approve', requestId });
  };

  const handleReject = (requestId: string) => {
    setDecisionModal({ open: true, type: 'reject', requestId });
  };

  const handleDecisionConfirm = async (note: string) => {
    const { type, requestId } = decisionModal;
    setDecisionModal((m) => ({ ...m, open: false }));
    if (!requestId) return;
    setProcessingRequest(requestId);
    try {
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: type === 'approve' ? 'approved' : 'rejected', decisionNote: note }),
      });
      if (response.ok) {
        await refetchData();
      }
    } catch (error) {
      console.error('Error processing request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  const refetchData = useCallback(async () => {
    await mutateDashboard();
  }, [mutateDashboard]);

  useEffect(() => {
    if (!dashboardLoading && dashboardData) {
      setTeam(dashboardData.team || null);
      setMembers(dashboardData.members || []);
      setAllRequests(dashboardData.requests || []);
      const pending = (dashboardData.requests || []).filter((req: LeaveRequest) => req.status === 'pending');
      setPendingRequests(pending);
      if (previousPendingRequestsRef.current.length === 0) {
        previousPendingRequestsRef.current = pending;
      }
      if (dashboardData.analytics) {
        setAnalytics(dashboardData.analytics as GroupedTeamAnalytics);
      }
      setLoading(false);
    }

    // Listen for settings updates to refresh analytics
    const handleSettingsUpdated = () => {
      // Add a small delay to ensure database write is fully committed before fetching
      setTimeout(() => {
        refetchData();
      }, 200);
    };

    window.addEventListener('teamSettingsUpdated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('teamSettingsUpdated', handleSettingsUpdated);
    };
  }, [dashboardData, dashboardLoading, refetchData]);

  // Real-time updates using SSE with fallback to polling
  useTeamEvents(team?._id || null, {
    enabled: !loading && !!team,
    fallbackToPolling: true,
    pollingCallback: async () => {
      if (!team) return;
      try {
        const data = await mutateDashboard();
        const currentData = data || dashboardData;
        if (!currentData) return;

        const currentPending = (currentData.requests || []).filter((req: LeaveRequest) => req.status === 'pending');
        // Polling fallback only refreshes state; notifications are emitted from SSE handlers.
        previousPendingRequestsRef.current = currentPending;
      } catch (error) {
        console.error('Error polling for new requests:', error);
      }
    },
    pollingInterval: 30000,
    onEvent: (event) => {
      if (event.type === 'leaveRequestCreated') {
        const data = event.data as { requestId: string; userId: string; startDate: string; endDate: string; reason: string; status: string };
        // Always refresh data when a new request is created, regardless of status
        refetchData();
        
        // Only show notification for pending requests
        if (data.status === 'pending') {
          // Find member name for notification
          const member = members.find(m => m._id === data.userId);
          const memberName = member?.fullName || member?.username || 'A team member';
          const startDate = parseDateSafe(data.startDate).toLocaleDateString();
          const endDate = parseDateSafe(data.endDate).toLocaleDateString();
          
          showNotification(
            'New Leave Request',
            `${memberName} has submitted a leave request for ${startDate} to ${endDate}`,
            undefined,
            { dedupeKey: `leader-new-request-${data.requestId}`, cooldownMs: 60000 }
          );
        }
      }
      
      // Handle leaveRequestUpdated
      if (event.type === 'leaveRequestUpdated') {
        const data = event.data as { requestId: string; newStatus: string };
        if (data.newStatus === 'approved' || data.newStatus === 'rejected') {
          // Remove from pending if approved/rejected
          refetchData();
        }
      }
      
      // Handle leaveRequestDeleted
      if (event.type === 'leaveRequestDeleted') {
        refetchData();
      }
      
      if (event.type === 'leaveRequestRestored') {
        refetchData();
      }
      
      // Handle settingsUpdated
      if (event.type === 'settingsUpdated') {
        // Refresh all data when settings change
        setTimeout(() => {
          refetchData();
        }, 200);
      }
    },
  });

  // Check for members at risk
  useEffect(() => {
    if (!analytics || !members.length || membersAtRiskNotifiedRef.current) return;
    
    // Calculate members at risk (losing days or low balance)
    let membersAtRisk = 0;
    
    if (analytics.groups) {
      const allMembers = analytics.groups.flatMap(g => g.members);
      membersAtRisk = allMembers.filter(m => {
        const willLose = m.analytics.willLose || 0;
        const remainingBalance = m.analytics.remainingLeaveBalance || 0;
        const maxLeavePerYear = team?.settings.maxLeavePerYear || 20;
        const isLowBalance = remainingBalance < maxLeavePerYear * 0.25;
        
        return willLose > 0 || isLowBalance;
      }).length;
    }
    
    if (membersAtRisk > 0) {
      membersAtRiskNotifiedRef.current = true;
      let notificationMessage = `${membersAtRisk} member(s) are at risk of losing leave days or have low balance.`;
      
      // Add carryover information if applicable
      if ((analytics.aggregate?.totalWillCarryover ?? 0) > 0 && team?.settings.allowCarryover) {
        notificationMessage += ` However, ${Math.round(analytics.aggregate!.totalWillCarryover)} day(s) will carry over to next year.`;
        
        if (team.settings.carryoverSettings?.limitedToMonths && team.settings.carryoverSettings.limitedToMonths.length > 0) {
          const monthNames = team.settings.carryoverSettings.limitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
          notificationMessage += ` Note: Carryover days can only be used in ${monthNames} of next year.`;
        }
        
        if (team.settings.carryoverSettings?.maxCarryoverDays && (analytics.aggregate?.totalWillCarryover ?? 0) > team.settings.carryoverSettings.maxCarryoverDays) {
          const excessDays = Math.round((analytics.aggregate!.totalWillCarryover) - team.settings.carryoverSettings.maxCarryoverDays);
          notificationMessage += ` Warning: Only ${team.settings.carryoverSettings.maxCarryoverDays} days can carry over. ${excessDays} day(s) will be lost.`;
        }
        
        if (team.settings.carryoverSettings?.expiryDate) {
          const expiryDate = new Date(team.settings.carryoverSettings.expiryDate);
          notificationMessage += ` Important: Carryover days expire on ${expiryDate.toLocaleDateString()}.`;
        }
      }
      
      showNotification(
        'Members at Risk Alert',
        notificationMessage,
        undefined,
        { dedupeKey: 'leader-members-at-risk', cooldownMs: 86400000 }
      );
    }
  }, [analytics, members, team, showNotification]);

  const leaderTeamHeadcount = useMemo(() => {
    if (!team || members.length === 0) return null;
    const peers = filterTeamMemberPeers(members);
    if (peers.length === 0) return null;
    const approved = allRequests.filter((r) => r.status === 'approved');
    const teamDays = buildHeadcountWeekForPeers(peers, approved);
    const enableSubgrouping = team.settings.enableSubgrouping === true;
    const subgroupBreakdown = enableSubgrouping
      ? uniqueSubgroupLabelsFromPeers(peers).map((label) => {
          const sgPeers = filterPeersBySubgroupLabel(peers, label);
          return {
            label,
            peerCount: sgPeers.length,
            days: buildHeadcountWeekForPeers(sgPeers, approved),
          };
        })
      : undefined;
    return {
      peerCount: peers.length,
      teamDays,
      scopeNote: enableSubgrouping ? 'Whole team (all subgroups)' : 'All team members',
      subgroupBreakdown,
    };
  }, [team, members, allRequests]);

  return (
    <ProtectedRoute requiredRole="leader">
      {loading ? (
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <Navbar />
        
        <div className="w-full px-4 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
          {/* Page header */}
          <div className="flex items-center justify-between py-5 border-b border-zinc-200 dark:border-zinc-800 mb-6">
            <div>
              <h1 className="app-page-heading text-base font-semibold text-zinc-900 dark:text-zinc-100">Leader Dashboard</h1>
              <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Your team at a glance</p>
            </div>
          </div>

          {/* Team health banner + key stats */}
          {analytics?.aggregate && team && (() => {
            const agg = analytics.aggregate;
            const memberCount = members.filter((m) => m.role === 'member').length || agg.membersCount || 0;
            const maxLeavePerYear = team.settings.maxLeavePerYear || 20;
            const remaining = agg.totalRemainingLeaveBalance ?? 0;
            const utilized = memberCount > 0 && maxLeavePerYear > 0
              ? Math.round(((memberCount * maxLeavePerYear - remaining) / (memberCount * maxLeavePerYear)) * 100)
              : 0;
            const atRisk = analytics.groups
              ? analytics.groups.flatMap((g) => g.members).filter((m) => (m.analytics.willLose || 0) > 0).length
              : 0;
            const avgRemaining = agg.averageRemainingBalance ?? 0;
            const pendingCount = (pendingRequests || []).length;
            const totalWillLose = agg.totalWillLose ?? 0;
            const totalWillCarryover = agg.totalWillCarryover ?? 0;
            const totalRealistic = agg.totalRealisticUsableDays ?? 0;

            const totalRemainderDays = agg.totalRemainderDays ?? 0;

            const teamHealth = calculateTimeBasedTeamHealthScore(
              memberCount,
              maxLeavePerYear,
              remaining,
              totalRealistic,
              atRisk,
              totalWillLose,
              totalWillCarryover,
              team.settings.carryoverSettings?.limitedToMonths,
              team.settings.carryoverSettings?.maxCarryoverDays,
              team.settings.carryoverSettings?.expiryDate
                ? new Date(team.settings.carryoverSettings.expiryDate)
                : undefined,
              totalRemainderDays
            );

            return (
              <>
                <div className={`rounded-[32px] border-2 ${teamHealth.borderColor} ${teamHealth.bgGradient} p-5 sm:p-6 mb-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${teamHealth.gradientColors} flex items-center justify-center shadow-md shrink-0`}>
                      <ChartBarIcon className="h-7 w-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Team leave health</p>
                      <h2 className={`text-2xl font-bold ${teamHealth.textColor} mt-0.5`}>{teamHealth.scoreLabel}</h2>
                      <p className={`text-base italic ${teamHealth.textColor} mt-2 leading-relaxed`}>&ldquo;{teamHealth.quote}&rdquo;</p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-2 leading-relaxed">{teamHealth.message}</p>
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-200/50 dark:border-zinc-700/50">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/10 dark:bg-white/15 text-zinc-900 dark:text-white">
                          {utilized}% team utilization
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/70 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-200">
                          {Math.round(totalRealistic)} realistic days (team)
                        </span>
                        {totalWillLose > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {Math.round(totalWillLose)} days at risk (year-end)
                          </span>
                        )}
                        {totalWillCarryover > 0 && team.settings.allowCarryover && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-100/80 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                            {Math.round(totalWillCarryover)} days will carry over
                          </span>
                        )}
                        {totalWillLose > 0 && (
                          <button
                            type="button"
                            onClick={() => setAllocationOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/10 dark:bg-white/15 text-zinc-900 dark:text-white hover:bg-black/20 dark:hover:bg-white/25 transition-colors"
                          >
                            <ScaleIcon className="h-3.5 w-3.5" />
                            {Math.round(totalWillLose)}d — review allocation
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                  <div className="stat-card p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pending</p>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{pendingCount}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">awaiting approval</p>
                      </div>
                      <div className="shrink-0 w-9 h-9 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center">
                        <ClockIcon className="h-5 w-5 text-amber-500" />
                      </div>
                    </div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Team days left</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{Math.round(remaining)}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">total remaining balance</p>
                      </div>
                      <div className="shrink-0 w-9 h-9 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                        <UsersIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Avg / member</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{Math.round(avgRemaining)}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">days remaining</p>
                      </div>
                      <div className="shrink-0 w-9 h-9 rounded-xl border border-sky-500/20 bg-sky-500/10 flex items-center justify-center">
                        <ChartBarIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </div>
                    </div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">At risk</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{atRisk}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">members (will lose)</p>
                      </div>
                      <div className="shrink-0 w-9 h-9 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                      </div>
                    </div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Utilization</p>
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{utilized}%</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">of allocated leave used</p>
                      </div>
                      <div className="shrink-0 w-9 h-9 rounded-xl border border-indigo-500/20 bg-indigo-500/10 flex items-center justify-center">
                        <ArrowTrendingUpIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Allocation nudge — only when members will actually lose days */}
                {totalWillLose > 0 && analytics.groups && (() => {
                  const affectedGroups = analytics.groups.filter((g) =>
                    g.members.some((m) => (m.analytics.willLose ?? 0) > 0)
                  );
                  return (
                    <div className="mb-6 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/25 p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                        <ScaleIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                          {Math.round(totalWillLose)} days at risk of being lost
                        </p>
                        <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-0.5">
                          {affectedGroups.length} group{affectedGroups.length !== 1 ? 's' : ''} can&apos;t accommodate everyone&apos;s balance — someone must sacrifice.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllocationOpen(true)}
                        className="shrink-0 btn-secondary text-xs py-1.5 px-3"
                      >
                        Review
                      </button>
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {/* Command center (queue + insights rail) */}
          {(() => {
            const maxLeavePerYear = team?.settings.maxLeavePerYear || 20;
            const memberCount = members.filter((m) => m.role === 'member').length || (analytics?.aggregate?.membersCount ?? 0);

            const aggregate = analytics?.aggregate;
            const totalRemainingBalance = aggregate?.totalRemainingLeaveBalance ?? 0;
            const totalWillLose = aggregate?.totalWillLose ?? 0;
            const totalWillCarryover = aggregate?.totalWillCarryover ?? 0;

            const utilizationRate =
              memberCount > 0 && maxLeavePerYear > 0
                ? ((memberCount * maxLeavePerYear - totalRemainingBalance) / (memberCount * maxLeavePerYear)) * 100
                : 0;

            const utilizationProgress = Math.max(0, Math.min(1, utilizationRate / 100));

            const queue = (pendingRequests || [])
              .slice()
              .sort((a, b) => parseDateSafe(b.createdAt).getTime() - parseDateSafe(a.createdAt).getTime())
              .slice(0, 6);

            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const in14 = new Date(now);
            in14.setDate(in14.getDate() + 14);

            const upcomingTeam = (allRequests || [])
              .filter((r) => r.status === 'approved')
              .filter((r) => {
                const s = parseDateSafe(r.startDate).getTime();
                return s >= now.getTime() && s <= in14.getTime();
              })
              .sort((a, b) => parseDateSafe(a.startDate).getTime() - parseDateSafe(b.startDate).getTime())
              .slice(0, 6)
              .map((r) => {
                const member = members?.find((m) => m._id === r.userId);
                return {
                  id: r._id || `${r.userId}-${parseDateSafe(r.startDate).toISOString()}`,
                  title: member?.username || 'Team member',
                  subtitle: `${parseDateSafe(r.startDate).toLocaleDateString()} – ${parseDateSafe(r.endDate).toLocaleDateString()}`,
                  meta: r.reason || undefined,
                  tone: 'info' as const,
                  right: <span className="text-xs text-zinc-400 dark:text-zinc-500">Approved</span>,
                };
              });

            const usageSignals = [
              totalWillLose,
              totalWillLose * 0.8,
              totalWillLose * 0.9,
              totalWillLose * 0.7,
              totalWillLose,
              totalWillLose * 1.1,
            ];

            return (
              <div className="grid lg:grid-cols-12 gap-6 mb-6 lg:items-start">
                <div className="lg:col-span-7 rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col min-h-0 max-h-[min(520px,calc(100vh-14rem))]">
                  <div className="shrink-0 p-4 sm:p-5 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Approvals queue</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                        {pendingRequests.length ? `${pendingRequests.length} pending` : 'All clear'}
                      </p>
                    </div>
                    <Link href="/leader/requests" className="btn-secondary text-xs py-1 px-2">
                      Open requests
                    </Link>
                  </div>

                  {leaderTeamHeadcount && (
                    <div className="shrink-0 px-4 py-3 sm:px-5 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/80 dark:bg-zinc-900/50">
                      <div className="flex flex-wrap items-start gap-3 sm:gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="shrink-0 w-9 h-9 rounded-lg border border-teal-500/25 bg-teal-500/10 flex items-center justify-center mt-0.5">
                            <BuildingOffice2Icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Today · staffing</p>
                            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight">
                              {leaderTeamHeadcount.teamDays[0].working}{' '}
                              <span className="text-zinc-400 font-medium text-sm">at work</span>
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {leaderTeamHeadcount.teamDays[0].scheduled} scheduled · {leaderTeamHeadcount.teamDays[0].onLeave}{' '}
                              on leave
                            </p>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">{leaderTeamHeadcount.scopeNote}</p>
                          </div>
                        </div>
                        <div className="flex-1 min-w-[12rem]">
                          <div className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                            {leaderTeamHeadcount.teamDays.map((day, i) => (
                              <div
                                key={day.date.toISOString()}
                                className="flex-shrink-0 min-w-[2.75rem] rounded-md border border-zinc-200/80 dark:border-zinc-700/80 bg-white/80 dark:bg-zinc-950/40 px-1.5 py-1 text-center"
                              >
                                <p className="text-[8px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase">
                                  {i === 0 ? 'Now' : day.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                                </p>
                                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{day.working}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-1.5 flex justify-end">
                            <Sparkline
                              data={leaderTeamHeadcount.teamDays.map((d) => d.working)}
                              width={160}
                              height={24}
                              className="text-teal-600 dark:text-teal-400"
                            />
                          </div>
                        </div>
                      </div>

                      {leaderTeamHeadcount.subgroupBreakdown && leaderTeamHeadcount.subgroupBreakdown.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-200/70 dark:border-zinc-800/70">
                          <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                            By subgroup · today
                          </p>
                          <div className="max-h-[min(240px,38vh)] lg:max-h-none overflow-y-auto overflow-x-hidden overscroll-contain -mx-0.5 px-0.5 pb-0.5 [scrollbar-gutter:stable]">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {leaderTeamHeadcount.subgroupBreakdown.map((sg) => {
                              const t0 = sg.days[0];
                              return (
                                <div
                                  key={sg.label}
                                  className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-white/90 dark:bg-zinc-950/50 px-2.5 py-2 min-w-0"
                                >
                                  <p className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 truncate" title={sg.label}>
                                    {sg.label}
                                  </p>
                                  <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight mt-0.5">
                                    {t0.working}{' '}
                                    <span className="text-zinc-400 font-medium text-xs">at work</span>
                                  </p>
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {t0.scheduled} sch · {t0.onLeave} leave · {sg.peerCount} people
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
                    {!queue.length ? (
                      <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                        <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        No pending requests right now.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {queue.map((request) => {
                          const member = members?.find((m) => m._id === request.userId);
                          return (
                            <div
                              key={request._id}
                              className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-950/20 px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                    {member?.username || 'Unknown user'}
                                  </p>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    {parseDateSafe(request.startDate).toLocaleDateString()} – {parseDateSafe(request.endDate).toLocaleDateString()}
                                  </p>
                                  {request.reason ? (
                                    <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1.5 line-clamp-2">{request.reason}</p>
                                  ) : null}
                                </div>
                                <div className="shrink-0 flex flex-col sm:flex-row gap-1.5">
                                  <button
                                    onClick={() => handleApprove(request._id!)}
                                    disabled={processingRequest === request._id}
                                    className="btn-primary text-xs py-1.5 px-2.5 disabled:opacity-50"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(request._id!)}
                                    disabled={processingRequest === request._id}
                                    className="btn-secondary text-xs py-1.5 px-2.5 disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6 lg:overflow-hidden">
                  <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Team health</p>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">Utilization</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {Math.round(utilizationRate)}% used &middot; {Math.round(totalWillCarryover)} carry over &middot; {Math.round(totalWillLose)} at risk
                        </p>
                      </div>
                      <ProgressRing
                        value={utilizationProgress}
                        size={52}
                        stroke={6}
                        label={<span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{Math.round(utilizationRate)}%</span>}
                      />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">Risk signal</span>
                      <Sparkline data={usageSignals} width={140} height={32} className="text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>

                  <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 lg:overflow-auto">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Next 14 days</p>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">Who’s out</p>
                      </div>
                      <Link href="/leader/calendar" className="btn-secondary text-xs py-1 px-2">
                        Calendar
                      </Link>
                    </div>
                    <div className="mt-3">
                      <Timeline
                        items={upcomingTeam}
                        empty={<p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming approved leave.</p>}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
      )}
      <DecisionModal
        open={decisionModal.open}
        type={decisionModal.type}
        onConfirm={handleDecisionConfirm}
        onCancel={() => setDecisionModal((m) => ({ ...m, open: false }))}
      />
      {analytics && allocationOpen && (
        <AllocationModal
          open={allocationOpen}
          onClose={() => setAllocationOpen(false)}
          analytics={analytics}
        />
      )}
    </ProtectedRoute>
  );
}
