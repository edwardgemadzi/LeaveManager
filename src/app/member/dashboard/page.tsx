'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { getEffectiveManualYearToDateUsed } from '@/lib/yearOverrides';
import { MemberAnalytics } from '@/lib/analyticsCalculations';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useRequests } from '@/hooks/useRequests';
import {
  filterPlanningPeers,
  countPeersWorkingOnDay,
  countScheduledPeersOnDay,
} from '@/lib/teamHeadcount';
import { calculateTimeBasedLeaveScore, getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { parseDateSafe } from '@/lib/dateUtils';
import { Sparkline } from '@/components/shared/Sparkline';
import { ProgressRing } from '@/components/shared/ProgressRing';
import { Timeline } from '@/components/shared/Timeline';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { 
  ClockIcon, 
  CalendarIcon, 
  CheckCircleIcon, 
  ChartBarIcon, 
  ArrowTrendingUpIcon, 
  UsersIcon, 
  ExclamationTriangleIcon,
  DocumentTextIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';

export default function MemberDashboard() {
  const { showNotification } = useBrowserNotification();
  const [team, setTeam] = useState<Team | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<MemberAnalytics | null>(null);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  
  // Refs to track notification state and prevent duplicates
  const previousRequestsRef = useRef<LeaveRequest[]>([]);
  const highCompetitionNotifiedRef = useRef(false);
  const losingDaysNotifiedRef = useRef(false);
  const leaveReminderNotifiedRef = useRef(false);

  const { data: dashboardData, mutate: mutateDashboard, isLoading: dashboardLoading } = useDashboardData({
    include: ['team', 'requests', 'analytics', 'currentUser', 'members'],
    requestFields: ['_id', 'userId', 'startDate', 'endDate', 'reason', 'status', 'decisionNote', 'decisionAt', 'decisionByUsername', 'createdAt'],
  });

  const { data: teamLeaveRequests } = useRequests({
    fields: ['_id', 'userId', 'startDate', 'endDate', 'status'],
    enabled: !!team?._id && !!user?._id,
  });

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
  }, []);

  useEffect(() => {
    if (!dashboardData) return;

    setTeam(dashboardData.team || null);
    if (dashboardData.currentUser) {
      setUser(dashboardData.currentUser);
    }

    if (Array.isArray(dashboardData.requests)) {
      const userIdToMatch = dashboardData.currentUser?._id || user?._id;
      if (!userIdToMatch) {
        setMyRequests([]);
      } else {
        const myRequests = dashboardData.requests.filter((req: LeaveRequest) => {
          const reqUserId = String(req.userId).trim();
          const currentUserId = String(userIdToMatch).trim();
          return reqUserId === currentUserId;
        });
        setMyRequests(myRequests);
        if (previousRequestsRef.current.length === 0) {
          previousRequestsRef.current = myRequests;
        }
      }
    } else {
      setMyRequests([]);
    }

    const analyticsPayload = dashboardData.analytics as { analytics?: MemberAnalytics } | undefined;
    if (analyticsPayload?.analytics) {
      setAnalytics(analyticsPayload.analytics);
    }

    const dm = dashboardData as { members?: User[] };
    if (Array.isArray(dm.members)) {
      setTeamMembers(dm.members);
    } else {
      setTeamMembers([]);
    }
  }, [dashboardData, user]);

  useEffect(() => {
    setLoading(dashboardLoading);
  }, [dashboardLoading]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      setTimeout(() => {
        mutateDashboard();
      }, 200);
    };

    window.addEventListener('teamSettingsUpdated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('teamSettingsUpdated', handleSettingsUpdated);
    };
  }, [mutateDashboard]);

  // Real-time updates using SSE with fallback to polling
  const refetchData = async () => {
    try {
      const data = await mutateDashboard();
      const currentData = data || dashboardData;
      if (!currentData) return;

      if (Array.isArray(currentData.requests)) {
        const userIdToMatch = currentData.currentUser?._id || user?._id;
        if (!userIdToMatch) {
          setMyRequests([]);
        } else {
          const myRequests = currentData.requests.filter((req: LeaveRequest) => {
            const reqUserId = String(req.userId).trim();
            const currentUserId = String(userIdToMatch).trim();
            return reqUserId === currentUserId;
          });
          setMyRequests(myRequests);
          previousRequestsRef.current = myRequests;
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useTeamEvents(team?._id || null, {
    enabled: !loading && !!user && !!team,
    fallbackToPolling: true,
    pollingCallback: async () => {
      if (!user) return;
      
      try {
        const data = await mutateDashboard();
        const currentData = data || dashboardData;
        if (currentData && Array.isArray(currentData.requests)) {
          const userIdToMatch = currentData.currentUser?._id || user._id;
          const currentRequests = userIdToMatch ? currentData.requests.filter((req: LeaveRequest) => {
            const reqUserId = String(req.userId).trim();
            const currentUserId = String(userIdToMatch).trim();
            return reqUserId === currentUserId;
          }) : [];
            
            // Polling fallback only refreshes state; notifications are emitted from SSE handlers.
            // Update state if requests changed
            if (currentRequests.length !== myRequests.length || 
                currentRequests.some((req: LeaveRequest, idx: number) => req._id !== myRequests[idx]?._id || req.status !== myRequests[idx]?.status)) {
              setMyRequests(currentRequests);
              if (currentData.team) setTeam(currentData.team);
              if (currentData.currentUser) setUser(currentData.currentUser);
              const analyticsPayload = currentData.analytics as { analytics?: MemberAnalytics } | undefined;
              if (analyticsPayload?.analytics) {
                setAnalytics(analyticsPayload.analytics);
              }
            }
            
            previousRequestsRef.current = currentRequests;
        }
      } catch (error) {
        console.error('Error polling for request status:', error);
      }
    },
    pollingInterval: 30000,
    onEvent: (event) => {
      // Handle leaveRequestCreated (if it's for this user)
      if (event.type === 'leaveRequestCreated') {
        const data = event.data as { requestId: string; userId: string; startDate: string; endDate: string; reason: string; status: string };
        if (user && String(data.userId).trim() === String(user._id).trim()) {
          // Add to my requests
          refetchData();
        }
      }
      
      // Handle leaveRequestUpdated (if it's for this user)
      if (event.type === 'leaveRequestUpdated') {
        const data = event.data as {
          requestId: string;
          userId: string;
          newStatus: string;
          decisionNote?: string;
          decisionAt?: string;
          decisionByUsername?: string;
        };
        if (user && String(data.userId).trim() === String(user._id).trim()) {
          // Update request status
          refetchData();
          
          // Show notification for status changes
          if (data.newStatus === 'approved') {
            showNotification(
              'Leave Request Approved',
              'Your leave request has been approved!',
              undefined,
              { dedupeKey: `member-leave-${data.requestId}-approved`, cooldownMs: 60000 }
            );
          } else if (data.newStatus === 'rejected') {
            showNotification(
              'Leave Request Rejected',
              typeof data.decisionNote === 'string' && data.decisionNote.trim().length > 0
                ? `Your leave request has been rejected. Reason: ${data.decisionNote}`
                : 'Your leave request has been rejected.',
              undefined,
              { dedupeKey: `member-leave-${data.requestId}-rejected`, cooldownMs: 60000 }
            );
          }
        }
      }
      
      // Handle leaveRequestDeleted (if it's for this user)
      if (event.type === 'leaveRequestDeleted') {
        const data = event.data as { requestId: string; userId: string };
        if (user && String(data.userId).trim() === String(user._id).trim()) {
          refetchData();
        }
      }
      
      if (event.type === 'leaveRequestRestored') {
        const data = event.data as { requestId: string; userId: string };
        if (user && String(data.userId).trim() === String(user._id).trim()) {
          refetchData();
        }
      }
      
      // Handle settingsUpdated
      if (event.type === 'settingsUpdated') {
        setTimeout(() => {
          refetchData();
        }, 200);
      }
    },
  });

  // Check for high competition warning
  useEffect(() => {
    if (!analytics || highCompetitionNotifiedRef.current) return;
    
    if (analytics.averageDaysPerMember < analytics.remainingLeaveBalance * 0.5) {
      highCompetitionNotifiedRef.current = true;
      showNotification(
        'High Competition Alert',
        `Only ${Math.round(analytics.averageDaysPerMember)} days per member available. Consider coordinating with your team.`,
        undefined,
        { dedupeKey: 'member-high-competition', cooldownMs: 86400000 }
      );
    }
  }, [analytics, showNotification]);

  // Check for losing days warning
  useEffect(() => {
    if (!analytics || losingDaysNotifiedRef.current) return;
    
    if (analytics.willLose > 0) {
      losingDaysNotifiedRef.current = true;
      let message = `You will lose ${Math.round(analytics.willLose)} day(s) at year end if not used. Plan your leave accordingly.`;
      
      // Add carryover information if applicable
      if (analytics.willCarryover > 0) {
        message = `You will lose ${Math.round(analytics.willLose)} day(s) at year end. However, ${Math.round(analytics.willCarryover)} day(s) will carry over to next year.`;
        
        if (analytics.carryoverLimitedToMonths && analytics.carryoverLimitedToMonths.length > 0) {
          const monthNames = analytics.carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
          message += ` Note: Carryover days can only be used in ${monthNames} of next year.`;
        }
        
        if (analytics.carryoverMaxDays && analytics.willCarryover > analytics.carryoverMaxDays) {
          const excessDays = Math.round(analytics.willCarryover - analytics.carryoverMaxDays);
          message += ` Warning: Only ${analytics.carryoverMaxDays} days can carry over. ${excessDays} day(s) will be lost.`;
        }
        
        if (analytics.carryoverExpiryDate) {
          const expiryDate = new Date(analytics.carryoverExpiryDate);
          message += ` Important: Carryover days expire on ${expiryDate.toLocaleDateString()}.`;
        }
      }
      
      showNotification(
        'Warning: Days Will Be Lost',
        message,
        undefined,
        { dedupeKey: 'member-days-will-be-lost', cooldownMs: 86400000 }
      );
    } else if (analytics.willCarryover > 0 && !losingDaysNotifiedRef.current) {
      // Also notify about carryover if there's no loss but carryover exists with limitations
      let message = `Great news: ${Math.round(analytics.willCarryover)} day(s) will carry over to next year!`;
      
      if (analytics.carryoverLimitedToMonths && analytics.carryoverLimitedToMonths.length > 0) {
        const monthNames = analytics.carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
        message += ` Note: These carryover days can only be used in ${monthNames} of next year.`;
      }
      
      if (analytics.carryoverMaxDays && analytics.willCarryover > analytics.carryoverMaxDays) {
        const excessDays = Math.round(analytics.willCarryover - analytics.carryoverMaxDays);
        message += ` Warning: Only ${analytics.carryoverMaxDays} days can carry over. ${excessDays} day(s) will be lost.`;
      }
      
      if (analytics.carryoverExpiryDate) {
        const expiryDate = new Date(analytics.carryoverExpiryDate);
        message += ` Important: Carryover days expire on ${expiryDate.toLocaleDateString()}.`;
      }
      
      losingDaysNotifiedRef.current = true;
      showNotification(
        'Carryover Information',
        message,
        undefined,
        { dedupeKey: 'member-carryover-info', cooldownMs: 86400000 }
      );
    }
  }, [analytics, showNotification]);

  // Check for take leave reminder (3+ months, 5+ days)
  useEffect(() => {
    if (!analytics || !myRequests || leaveReminderNotifiedRef.current) return;
    
    // Check if member has 5+ days remaining
    if (analytics.remainingLeaveBalance < 5) return;
    
    // Check if member hasn't taken leave in 3+ months
    const approvedRequests = myRequests.filter(req => req.status === 'approved');
    if (approvedRequests.length === 0) {
      // Never taken leave, check if account is older than 3 months
      // For now, we'll check if they have requests but none approved recently
      leaveReminderNotifiedRef.current = true;
      showNotification(
        'Take Leave Reminder',
        `You haven't taken leave recently and have ${Math.round(analytics.remainingLeaveBalance)} days remaining. Consider planning your leave.`,
        undefined,
        { dedupeKey: 'member-take-leave-reminder', cooldownMs: 86400000 }
      );
      return;
    }
    
    // Find most recent approved request
    const mostRecent = approvedRequests.reduce((latest, req) => {
      const reqDate = parseDateSafe(req.endDate);
      const latestDate = parseDateSafe(latest.endDate);
      return reqDate > latestDate ? req : latest;
    });
    
    const monthsSinceLastLeave = (Date.now() - parseDateSafe(mostRecent.endDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsSinceLastLeave >= 3) {
      leaveReminderNotifiedRef.current = true;
      showNotification(
        'Take Leave Reminder',
        `You haven't taken leave in ${Math.round(monthsSinceLastLeave)} months and have ${Math.round(analytics.remainingLeaveBalance)} days remaining. Consider planning your leave.`,
        undefined,
        { dedupeKey: 'member-take-leave-reminder', cooldownMs: 86400000 }
      );
    }
  }, [analytics, myRequests, showNotification]);

  const getLeaveBalance = () => {
    if (!team || !user) {
      return { balance: 0, surplus: 0 };
    }
    
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved')
      .map(req => ({
        startDate: parseDateSafe(req.startDate),
        endDate: parseDateSafe(req.endDate),
        reason: req.reason
      }));

    const balance = calculateLeaveBalance(
      team.settings.maxLeavePerYear,
      approvedRequests,
      user,
      user.manualLeaveBalance,
      getEffectiveManualYearToDateUsed(user),
      team.settings.carryoverSettings
    );
    
    const surplus = calculateSurplusBalance(user.manualLeaveBalance, team.settings.maxLeavePerYear);
    
    return { balance, surplus };
  };

  const getMaternityLeaveBalance = () => {
    if (!team || !user) {
      return { balance: 0, surplus: 0, daysUsed: 0 };
    }
    
    // Determine which type of leave the user is assigned
    const userType = user.maternityPaternityType;
    
    // Check if the assigned leave type is enabled
    if (userType === 'paternity') {
      if (!team.settings.paternityLeave?.enabled) {
        return { balance: 0, surplus: 0, daysUsed: 0 };
      }
    } else if (userType === 'maternity') {
      if (!team.settings.maternityLeave?.enabled) {
        return { balance: 0, surplus: 0, daysUsed: 0 };
      }
    } else {
      // No type assigned, return empty data
      return { balance: 0, surplus: 0, daysUsed: 0 };
    }
    
    // Get appropriate leave settings based on user's assigned type
    // Default to maternity if type is not assigned (backward compatibility)
    let maxLeaveDays: number;
    let countingMethod: 'calendar' | 'working';
    
    if (userType === 'paternity') {
      maxLeaveDays = team.settings.paternityLeave?.maxDays || 90;
      countingMethod = team.settings.paternityLeave?.countingMethod || 'working';
    } else {
      // Default to maternity (for backward compatibility or if type is 'maternity' or null)
      maxLeaveDays = team.settings.maternityLeave?.maxDays || 90;
      countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
    }
    
    // Filter requests based on user's assigned type
    const approvedMaternityRequests = myRequests
      .filter(req => {
        if (req.status !== 'approved' || !req.reason) return false;
        const lowerReason = req.reason.toLowerCase();
        
        if (userType === 'paternity') {
          // For paternity users, only count paternity requests
          return lowerReason.includes('paternity') && !lowerReason.includes('maternity');
        } else {
          // For maternity users (or unassigned), only count maternity requests
          return lowerReason.includes('maternity') || (isMaternityLeave(req.reason) && !lowerReason.includes('paternity'));
        }
      })
      .map(req => ({
        startDate: parseDateSafe(req.startDate),
        endDate: parseDateSafe(req.endDate),
        reason: req.reason
      }));

    const balance = calculateMaternityLeaveBalance(
      maxLeaveDays,
      approvedMaternityRequests,
      countingMethod,
      user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' },
      user.manualMaternityLeaveBalance,
      user.manualMaternityYearToDateUsed
    );
    
    const surplus = calculateMaternitySurplusBalance(user.manualMaternityLeaveBalance, maxLeaveDays);
    
    // Calculate days used
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let daysUsed = 0;
    if (user.manualMaternityYearToDateUsed !== undefined) {
      daysUsed = user.manualMaternityYearToDateUsed;
    } else {
      daysUsed = approvedMaternityRequests.reduce((total, req) => {
        const reqStart = parseDateSafe(req.startDate);
        const reqEnd = parseDateSafe(req.endDate);
        reqStart.setHours(0, 0, 0, 0);
        reqEnd.setHours(23, 59, 59, 999);
        
        const overlapEnd = reqEnd < today ? reqEnd : today;
        if (overlapEnd >= reqStart) {
          const days = countMaternityLeaveDays(reqStart, overlapEnd, countingMethod, user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' });
          return total + days;
        }
        return total;
      }, 0);
    }
    
    return { balance, surplus, daysUsed };
  };

  const teamHeadcountPreview = useMemo(() => {
    if (!user || !team || teamMembers.length === 0) return null;
    const peers = filterPlanningPeers(teamMembers, user, team);
    if (peers.length === 0) return null;
    const approved =
      teamLeaveRequests === undefined
        ? null
        : teamLeaveRequests.filter((r) => r.status === 'approved');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const scheduled = countScheduledPeersOnDay(d, peers);
      const working =
        approved === null ? null : countPeersWorkingOnDay(d, peers, approved);
      const onLeave =
        working === null ? null : Math.max(0, scheduled - working);
      return { date: d, scheduled, working, onLeave };
    });
    return {
      peerCount: peers.length,
      days,
      loadingLeave: approved === null,
      subgroupNote: team.settings.enableSubgrouping
        ? `Your subgroup (${user.subgroupTag || 'Ungrouped'})`
        : 'Whole team (members)',
    };
  }, [user, team, teamMembers, teamLeaveRequests]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Use analytics as the source of truth for leave balance if available
  // Fallback to local calculation if analytics is not yet loaded
  const leaveBalance = analytics 
    ? { 
        balance: analytics.remainingLeaveBalance, 
        surplus: analytics.surplusBalance ?? 0 
      }
    : getLeaveBalance();
  const annualRemainingBalance = analytics
    ? analytics.remainingLeaveBalance - (analytics.carryoverBalance ?? 0)
    : leaveBalance.balance;

  return (
    <ProtectedRoute requiredRole="member">
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <Navbar />
        
        <div className="w-full px-4 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
          {/* Page header */}
          <div className="flex items-center justify-between py-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
            <div>
              <h1 className="app-page-heading text-base font-semibold text-zinc-900 dark:text-zinc-100">My Dashboard</h1>
              <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Your leave overview</p>
            </div>
          </div>

          {/* Stat cards — reference layout: label, value, sublines, themed icon */}
          {analytics && user && team && (() => {
            const pendingCount = myRequests.filter((r) => r.status === 'pending').length;
            const carriedOver = Math.round(user.carryoverFromPreviousYear ?? 0);
            const usedCarry = Math.round(analytics.carryoverDaysUsed ?? 0);
            const carryRem = analytics.carryoverExpired
              ? Math.round(analytics.carryoverRemainingDisplay ?? 0)
              : Math.round(analytics.carryoverBalance ?? 0);
            const matPat = getMaternityLeaveBalance();
            const paternityEnabled = team.settings.paternityLeave?.enabled === true;
            const isPaternityUser = user.maternityPaternityType === 'paternity';

            const workingDaysTagLine =
              user.shiftSchedule
                ? user.shiftSchedule.type === 'rotating'
                  ? generateWorkingDaysTag(user.shiftSchedule)
                  : user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule)
                : '';
            const groupName = workingDaysTagLine
              ? getWorkingDaysGroupDisplayName(workingDaysTagLine, team.settings)
              : '';

            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4 shrink-0">
                  {/* Pending */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Pending requests
                        </p>
                        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{pendingCount}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Awaiting approval</p>
                      </div>
                      <div className="shrink-0 w-10 h-10 rounded-xl border border-amber-500/25 bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center">
                        <ClockIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                      </div>
                    </div>
                  </div>

                  {/* Paternity (balance lives in Balance hero below) */}
                  <div
                    className={`rounded-2xl border p-4 shadow-sm ${
                      !paternityEnabled
                        ? 'border-zinc-200/90 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50'
                        : 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Paternity leave
                        </p>
                        {!paternityEnabled ? (
                          <>
                            <p className="text-lg font-medium text-zinc-500 dark:text-zinc-500 italic mt-1">Not available</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-snug">
                              Not enabled for your team
                            </p>
                          </>
                        ) : isPaternityUser ? (
                          <>
                            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
                              {Math.round(matPat.balance)}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-snug">
                              Days remaining · {matPat.daysUsed} used this year
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-lg font-medium text-zinc-500 dark:text-zinc-500 mt-1">Not assigned</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-snug">
                              Your role is not set to paternity leave
                            </p>
                          </>
                        )}
                      </div>
                      <div
                        className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${
                          !paternityEnabled
                            ? 'border-zinc-500/20 bg-zinc-500/10'
                            : 'border-violet-500/25 bg-violet-500/10 dark:bg-violet-500/15'
                        }`}
                      >
                        <CalendarIcon
                          className={`h-5 w-5 ${!paternityEnabled ? 'text-zinc-500' : 'text-violet-600 dark:text-violet-400'}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Carryover */}
                  <div
                    className={`rounded-2xl border p-4 shadow-sm ${
                      analytics.carryoverExpired
                        ? 'border-red-300/80 dark:border-red-800/80 bg-red-50/50 dark:bg-red-950/20'
                        : 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Carryover balance
                        </p>
                        <div className="flex flex-wrap items-baseline gap-2 mt-1">
                          <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                            {carriedOver > 0 ? `${carryRem}/${carriedOver}` : carryRem}
                          </span>
                          {analytics.carryoverExpired && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
                              Expired
                            </span>
                          )}
                        </div>
                        {carriedOver > 0 && (
                          <div className="mt-2 space-y-0.5 text-xs leading-relaxed">
                            <p className="text-sky-600 dark:text-sky-400">Carried over: {carriedOver} days</p>
                            <p className="text-zinc-500 dark:text-zinc-500">Used this year: {usedCarry}</p>
                            <p className="text-zinc-600 dark:text-zinc-300">
                              Remaining: {carryRem}
                              {analytics.carryoverExpired && (
                                <span className="ml-1.5 text-red-600 dark:text-red-400 font-medium">Expired</span>
                              )}
                            </p>
                          </div>
                        )}
                        {carriedOver <= 0 && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                            {(analytics.carryoverBalance ?? 0) > 0
                              ? 'Usable carryover this year'
                              : 'No carryover on file'}
                          </p>
                        )}
                      </div>
                      <div
                        className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${
                          analytics.carryoverExpired
                            ? 'border-red-500/30 bg-red-500/10'
                            : 'border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/15'
                        }`}
                      >
                        <ArrowTrendingUpIcon
                          className={`h-5 w-5 ${
                            analytics.carryoverExpired ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Days taken */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 shadow-sm">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Days taken
                        </p>
                        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
                          {Math.round(analytics.workingDaysUsed ?? 0)}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">This year</p>
                      </div>
                      <div className="shrink-0 w-10 h-10 rounded-xl border border-sky-500/25 bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center">
                        <CheckCircleIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={`grid gap-3 mb-3 shrink-0 ${
                    teamHeadcountPreview ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'
                  }`}
                >
                  <div className={teamHeadcountPreview ? 'lg:col-span-8 space-y-3' : 'space-y-3'}>
                {/* Competition context */}
                <div className="rounded-2xl border-2 border-indigo-300/80 dark:border-indigo-700/80 bg-indigo-50/90 dark:bg-indigo-950/35 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <UsersIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Competition context</p>
                        {analytics.hasPartialCompetition && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              analytics.partialOverlapMembersWithBalance > 0
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border border-orange-300/80 dark:border-orange-700'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            {analytics.partialOverlapMembersWithBalance > 0 ? '⚠ ' : 'ℹ '}
                            {analytics.partialOverlapMembersCount} partial overlap
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-indigo-800 dark:text-indigo-300/95 leading-relaxed">
                        <strong>{analytics.membersSharingSameShift}</strong> team member
                        {analytics.membersSharingSameShift !== 1 ? 's' : ''} with the{' '}
                        <strong>same working days pattern</strong>
                        {groupName ? ` (${groupName})` : ''} and <strong>shift type</strong> share roughly{' '}
                        <strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days.
                      </p>
                      {analytics.hasPartialCompetition && analytics.partialOverlapMembersWithBalance > 0 && (
                        <p className="text-sm text-orange-700 dark:text-orange-400 mt-2 leading-relaxed font-medium">
                          {analytics.partialOverlapMembersWithBalance} member
                          {analytics.partialOverlapMembersWithBalance !== 1 ? 's' : ''} with different shift patterns but overlapping
                          working days {analytics.partialOverlapMembersWithBalance > 1 ? 'have' : 'has'} balances and may compete for the
                          same dates.
                        </p>
                      )}
                      {analytics.hasPartialCompetition && analytics.partialOverlapMembersWithBalance === 0 && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                          {analytics.partialOverlapMembersCount} member
                          {analytics.partialOverlapMembersCount !== 1 ? 's' : ''} with overlapping days (no active leave balances).
                        </p>
                      )}
                      <p className="text-sm text-indigo-800 dark:text-indigo-300/95 mt-2 leading-relaxed">
                        Average <strong>{Math.round(analytics.averageDaysPerMember)}</strong> days per member available · you can realistically
                        use <strong>{Math.round(analytics.realisticUsableDays ?? 0)}</strong> days.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Concurrent leave constraint */}
                <div
                  className={`rounded-2xl border-2 p-4 sm:p-5 ${
                    analytics.usableDays < analytics.theoreticalWorkingDays
                      ? 'border-orange-300/90 dark:border-orange-700/80 bg-orange-50/90 dark:bg-orange-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        analytics.usableDays < analytics.theoreticalWorkingDays
                          ? 'bg-orange-500/15 border-orange-500/25'
                          : 'bg-emerald-500/10 border-emerald-500/20'
                      }`}
                    >
                      {analytics.usableDays < analytics.theoreticalWorkingDays ? (
                        <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      ) : (
                        <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Concurrent leave constraint</p>
                      {analytics.usableDays < analytics.theoreticalWorkingDays ? (
                        <p className="text-sm text-orange-800 dark:text-orange-300/95 leading-relaxed">
                          Due to concurrent leave limits, you have <strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days
                          of <strong>{Math.round(analytics.theoreticalWorkingDays)}</strong> remaining working days. Some days are already
                          booked by other team members.
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          No concurrent cap is limiting you right now — your usable days match your remaining working days (
                          <strong>{Math.round(analytics.usableDays ?? 0)}</strong> /{' '}
                          <strong>{Math.round(analytics.theoreticalWorkingDays)}</strong>).
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                  </div>

                  {teamHeadcountPreview && (
                    <div className="lg:col-span-4 min-h-0">
                      <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 shadow-sm h-full flex flex-col">
                        <div className="flex justify-between items-start gap-3 flex-1 min-h-0">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                              People at work
                            </p>
                            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
                              {teamHeadcountPreview.loadingLeave
                                ? '—'
                                : teamHeadcountPreview.days[0].working ?? 0}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-snug">
                              {teamHeadcountPreview.loadingLeave
                                ? 'Loading leave…'
                                : `${teamHeadcountPreview.days[0].scheduled} scheduled today · ${teamHeadcountPreview.days[0].onLeave ?? 0} on leave`}
                            </p>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">{teamHeadcountPreview.subgroupNote}</p>
                            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 sm:mx-0">
                              {teamHeadcountPreview.days.map((day, i) => (
                                <div
                                  key={day.date.toISOString()}
                                  className="relative flex-shrink-0 min-w-[3.5rem] rounded-lg border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/80 dark:bg-zinc-800/80 px-2 py-1.5 text-center"
                                >
                                  <p className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                                    {i === 0 ? 'Today' : day.date.toLocaleDateString(undefined, { weekday: 'short' })}
                                  </p>
                                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                    {teamHeadcountPreview.loadingLeave ? '—' : day.working ?? 0}
                                  </p>
                                  {!teamHeadcountPreview.loadingLeave && (
                                    <p className="text-[9px] text-zinc-500 dark:text-zinc-500 mt-0.5">
                                      {day.date.getMonth() + 1}/{day.date.getDate()}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                            {!teamHeadcountPreview.loadingLeave && (
                              <div className="mt-2 w-full min-w-0 max-w-full overflow-hidden">
                                <Sparkline
                                  data={teamHeadcountPreview.days.map((d) => d.working ?? 0)}
                                  width={200}
                                  height={28}
                                  className="text-teal-600 dark:text-teal-400 max-w-full"
                                />
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 w-10 h-10 rounded-xl border border-teal-500/25 bg-teal-500/10 dark:bg-teal-500/15 flex items-center justify-center">
                            <BuildingOffice2Icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Dashboard — 2-column layout filling the viewport */}
          {(() => {
            const maxPerYear = team?.settings.maxLeavePerYear || 20;
            const used = Math.max(0, Math.round(maxPerYear - annualRemainingBalance));
            const pendingCount = myRequests.filter((r) => r.status === 'pending').length;
            const remaining = Math.round(leaveBalance.balance);
            const progress = maxPerYear > 0 ? Math.max(0, Math.min(1, used / maxPerYear)) : 0;
            const currentYear = new Date().getFullYear();
            const shiftSchedule =
              user?.shiftSchedule || {
                pattern: [true, true, true, true, true, false, false],
                startDate: new Date(),
                type: 'rotating' as const,
              };
            const monthlyUsage = Array.from({ length: 12 }, (_, month) => {
              let sum = 0;
              const monthStart = new Date(currentYear, month, 1);
              const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999);
              for (const r of myRequests) {
                if (r.status !== 'approved') continue;
                const start = parseDateSafe(r.startDate);
                const end = parseDateSafe(r.endDate);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                if (end < monthStart || start > monthEnd) continue;
                const ms = start > monthStart ? start : monthStart;
                const me = end < monthEnd ? end : monthEnd;
                sum += countWorkingDays(ms, me, shiftSchedule);
              }
              return sum;
            });

            const leaveScore = analytics
              ? calculateTimeBasedLeaveScore(
                  maxPerYear,
                  used,
                  analytics.remainingLeaveBalance,
                  analytics.realisticUsableDays ?? 0,
                  analytics.willLose ?? 0,
                  analytics.willCarryover ?? 0,
                  user?.manualYearToDateUsed !== undefined,
                  team?.settings.carryoverSettings?.limitedToMonths,
                  team?.settings.carryoverSettings?.maxCarryoverDays,
                  team?.settings.carryoverSettings?.expiryDate
                    ? new Date(team.settings.carryoverSettings.expiryDate)
                    : undefined
                )
              : null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const upcomingApproved = myRequests
              .filter((r) => r.status === 'approved' && parseDateSafe(r.endDate).getTime() >= today.getTime())
              .sort((a, b) => parseDateSafe(a.startDate).getTime() - parseDateSafe(b.startDate).getTime());
            const nextApproved =
              upcomingApproved.find((r) => parseDateSafe(r.startDate).getTime() >= today.getTime()) ?? upcomingApproved[0];

            const upcomingItems = [
              ...(pendingCount > 0
                ? [{
                    id: 'pending',
                    title: `${pendingCount} pending request${pendingCount !== 1 ? 's' : ''}`,
                    subtitle: 'Waiting for approval',
                    tone: 'warning' as const,
                    right: <Link href="/member/requests" className="btn-secondary text-xs py-1 px-2">View</Link>,
                  }]
                : []),
              ...(nextApproved?._id
                ? [{
                    id: `next-${nextApproved._id}`,
                    title: 'Next leave',
                    subtitle: `${parseDateSafe(nextApproved.startDate).toLocaleDateString()} \u2013 ${parseDateSafe(nextApproved.endDate).toLocaleDateString()}`,
                    meta: nextApproved.reason || undefined,
                    tone: 'info' as const,
                    right: <Link href="/member/calendar" className="btn-secondary text-xs py-1 px-2">Calendar</Link>,
                  }]
                : [{
                    id: 'no-upcoming',
                    title: 'No upcoming leave',
                    subtitle: 'Plan something to recharge',
                    tone: 'neutral' as const,
                    right: <Link href="/member/requests" className="btn-primary text-xs py-1 px-2">Request</Link>,
                  }]),
            ];

            const recentActivity = myRequests
              .slice()
              .sort((a, b) => parseDateSafe(b.updatedAt).getTime() - parseDateSafe(a.updatedAt).getTime())
              .slice(0, 6)
              .map((r) => {
                const tone: 'success' | 'danger' | 'warning' =
                  r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning';
                return {
                  id: r._id || `${r.userId}-${r.status}`,
                  title: `${r.status[0].toUpperCase()}${r.status.slice(1)} request`,
                  description: `${parseDateSafe(r.startDate).toLocaleDateString()} \u2013 ${parseDateSafe(r.endDate).toLocaleDateString()}${r.reason ? ` \u00b7 ${r.reason}` : ''}`,
                  time: parseDateSafe(r.updatedAt).toLocaleDateString(),
                  tone,
                };
              });

            return (
              <div className="grid lg:grid-cols-12 gap-5 lg:min-h-[min(520px,calc(100vh-32rem))] lg:overflow-hidden">

                {/* Left column: Health Score + Recent Activity */}
                <div className="lg:col-span-7 flex flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-hidden">

                  {/* Leave Health Score */}
                  {leaveScore ? (
                    <div className={`rounded-[32px] border-2 ${leaveScore.borderColor} ${leaveScore.bgGradient} p-5 sm:p-6`}>
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${leaveScore.gradientColors} flex items-center justify-center shadow-md shrink-0`}>
                          <ChartBarIcon className="h-7 w-7 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Leave Health Score</p>
                          <h2 className={`text-2xl font-bold ${leaveScore.textColor} mt-0.5`}>{leaveScore.scoreLabel}</h2>
                        </div>
                        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${leaveScore.badgeColor}`}>
                          {used}/{maxPerYear} used
                        </span>
                      </div>
                      <p className={`text-base italic ${leaveScore.textColor} mb-2 leading-relaxed`}>&ldquo;{leaveScore.quote}&rdquo;</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mb-4">{leaveScore.message}</p>
                      <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-200/50 dark:border-zinc-700/50">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/60 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-200">
                          {Math.round(analytics?.realisticUsableDays ?? 0)} realistic days left
                        </span>
                        {(analytics?.willLose ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {Math.round(analytics!.willLose ?? 0)} at risk
                          </span>
                        )}
                        {(analytics?.willCarryover ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-100/80 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                            {Math.round(analytics!.willCarryover ?? 0)} carry over
                          </span>
                        )}
                        {(analytics?.membersSharingSameShift ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/60 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-200">
                            <UsersIcon className="h-3.5 w-3.5" />
                            {analytics!.membersSharingSameShift} competing
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 flex items-center justify-center min-h-[140px]">
                      <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading health score&hellip;</p>
                    </div>
                  )}

                  {/* Recent Activity */}
                  <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 flex-1 flex flex-col min-h-0 lg:overflow-hidden">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Recent activity</p>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">Your latest request updates</p>
                      </div>
                      <Link href="/member/requests" className="btn-secondary text-xs py-1 px-2">View all</Link>
                    </div>
                    <div className="app-scroll-list max-h-[min(320px,50vh)] lg:max-h-none">
                      <ActivityFeed items={recentActivity} empty={<p className="text-sm text-zinc-500 dark:text-zinc-400">No activity yet.</p>} />
                    </div>
                  </div>
                </div>

                {/* Right column: Balance today + Upcoming */}
                <div className="lg:col-span-5 flex flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-hidden">

                  {/* Balance today */}
                  <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          Balance today
                        </p>
                        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
                          {remaining} <span className="text-zinc-400 dark:text-zinc-500 font-semibold">/</span>{' '}
                          {maxPerYear}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Days remaining this year</p>
                      </div>
                      <ProgressRing
                        value={progress}
                        size={52}
                        stroke={6}
                        label={
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                            {Math.round(progress * 100)}%
                          </span>
                        }
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100/90 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-200">
                        {used} used
                      </span>
                      {analytics && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">
                          Carryover {Math.round(analytics.carryoverBalance ?? 0)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                        {pendingCount} pending
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">This year (by month)</span>
                      <Sparkline
                        data={monthlyUsage}
                        width={160}
                        height={32}
                        className="text-indigo-600 dark:text-indigo-400 min-w-0 max-w-full"
                      />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link href="/member/requests" className="btn-primary">
                        <DocumentTextIcon className="h-4 w-4" />
                        Request leave
                      </Link>
                      <Link href="/member/calendar" className="btn-secondary">
                        <CalendarIcon className="h-4 w-4" />
                        Calendar
                      </Link>
                      <Link href="/member/analytics" className="btn-secondary">
                        <ChartBarIcon className="h-4 w-4" />
                        Insights
                      </Link>
                    </div>
                  </div>

                  {/* Upcoming */}
                  <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 flex-1 lg:overflow-auto">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Upcoming</p>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">What&apos;s next</p>
                      </div>
                      <ClockIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <Timeline items={upcomingItems} empty={<p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing queued yet.</p>} />
                  </div>
                </div>

              </div>
            );
          })()}

        </div>
      </div>
    </ProtectedRoute>
  );
}
