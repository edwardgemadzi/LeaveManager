'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, calculateSurplusBalance, calculateMaternityLeaveBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { 
  UsersIcon, 
  ClockIcon, 
  ChartBarIcon, 
  UserIcon, 
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  FireIcon
} from '@heroicons/react/24/outline';

export default function LeaderDashboard() {
  const { showNotification } = useBrowserNotification();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);
  
  // Refs to track notification state and prevent duplicates
  const previousPendingRequestsRef = useRef<LeaveRequest[]>([]);
  const membersAtRiskNotifiedRef = useRef(false);

  const handleApprove = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (response.ok) {
        // Refetch all data to update balances
        await refetchData();
      }
    } catch (error) {
      console.error('Error approving request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (response.ok) {
        // Refetch all data to update balances
        await refetchData();
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  const refetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');

      if (!user.teamId) {
        console.error('No team ID found');
        return;
      }

      // Fetch all dashboard data in a single API call
      const response = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch dashboard data:', response.status);
        return;
      }

      const data = await response.json();
      
      // Set all state from single response
      setTeam(data.team);
      setMembers(data.members || []);
      setAllRequests(data.requests || []);
      const pending = (data.requests || []).filter((req: LeaveRequest) => req.status === 'pending');
      setPendingRequests(pending);
      // Initialize previous pending requests ref for polling comparison
      if (previousPendingRequestsRef.current.length === 0) {
        previousPendingRequestsRef.current = pending;
      }
      
      // Analytics structure for leaders: { analytics: GroupedTeamAnalytics }
      if (data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        await refetchData();
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
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
  }, []);

  // Real-time updates using SSE with fallback to polling
  useTeamEvents(team?._id || null, {
    enabled: !loading && !!team,
    fallbackToPolling: true,
    pollingCallback: async () => {
      if (!team) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/dashboard', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const currentPending = (data.requests || []).filter((req: LeaveRequest) => req.status === 'pending');
          
          // Check for new requests
          const previousIds = new Set(previousPendingRequestsRef.current.map(r => r._id));
          const newRequests = currentPending.filter((req: LeaveRequest) => !previousIds.has(req._id));
          
          if (newRequests.length > 0) {
            // Update state with new data
            setAllRequests(data.requests || []);
            setPendingRequests(currentPending);
            setMembers(data.members || []);
            if (data.analytics) {
              setAnalytics(data.analytics);
            }
            
            // Find member names for new requests
            const currentMembers = data.members || members;
            newRequests.forEach((req: LeaveRequest) => {
              const member = currentMembers.find((m: User) => m._id === req.userId);
              const memberName = member?.fullName || member?.username || 'A team member';
              const startDate = new Date(req.startDate).toLocaleDateString();
              const endDate = new Date(req.endDate).toLocaleDateString();
              
              showNotification(
                'New Leave Request',
                `${memberName} has submitted a leave request for ${startDate} to ${endDate}`
              );
            });
          }
          
          previousPendingRequestsRef.current = currentPending;
        }
      } catch (error) {
        console.error('Error polling for new requests:', error);
      }
    },
    pollingInterval: 30000,
    onEvent: (event) => {
      console.log('[LeaderDashboard] Received event:', event.type, event.data);
      // Handle leaveRequestCreated
      if (event.type === 'leaveRequestCreated') {
        const data = event.data as { requestId: string; userId: string; startDate: string; endDate: string; reason: string; status: string };
        console.log('[LeaderDashboard] leaveRequestCreated event data:', data);
        // Always refresh data when a new request is created, regardless of status
        refetchData();
        
        // Only show notification for pending requests
        if (data.status === 'pending') {
          // Find member name for notification
          const member = members.find(m => m._id === data.userId);
          const memberName = member?.fullName || member?.username || 'A team member';
          const startDate = new Date(data.startDate).toLocaleDateString();
          const endDate = new Date(data.endDate).toLocaleDateString();
          
          showNotification(
            'New Leave Request',
            `${memberName} has submitted a leave request for ${startDate} to ${endDate}`
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
      showNotification(
        'Members at Risk Alert',
        `${membersAtRisk} member(s) are at risk of losing leave days or have low balance.`
      );
    }
  }, [analytics, members, team, showNotification]);

  const getLeaveBalanceSummary = () => {
    if (!team || !members.length) return { totalRemaining: 0, averageRemaining: 0, membersWithLowBalance: 0, totalSurplus: 0, membersWithSurplus: 0 };

    // Use analytics aggregate data if available
    const totalRemaining = analytics?.aggregate.totalRemainingLeaveBalance ?? 0;
    const averageRemaining = analytics?.aggregate.averageRemainingBalance ?? 0;
    
    // Calculate membersWithLowBalance and surplus from analytics members data
    let membersWithLowBalance = 0;
    let totalSurplus = 0;
    let membersWithSurplus = 0;
    const maxLeavePerYear = team.settings.maxLeavePerYear;
    
    if (analytics && analytics.groups) {
      // Get all members from analytics groups
      const allMembers = analytics.groups.flatMap(g => g.members);
      
      // Calculate surplus from analytics members
      totalSurplus = allMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
      membersWithSurplus = allMembers.filter(m => m.analytics.surplusBalance > 0).length;
      
      // Calculate low balance members
      membersWithLowBalance = allMembers.filter(m => 
        m.analytics.remainingLeaveBalance < maxLeavePerYear * 0.25
      ).length;
    } else {
      // Fallback to calculation if analytics not available
      members.forEach(member => {
        if (member.role === 'member' && member.shiftSchedule) {
          const memberRequests = allRequests.filter(req => 
            req.userId === member._id && req.status === 'approved'
          );

          const approvedRequests = memberRequests.map(req => ({
            startDate: new Date(req.startDate),
            endDate: new Date(req.endDate)
          }));

          const remainingBalance = calculateLeaveBalance(
            maxLeavePerYear,
            approvedRequests,
            member.shiftSchedule,
            member.manualLeaveBalance,
            member.manualYearToDateUsed
          );

          const surplus = calculateSurplusBalance(member.manualLeaveBalance, maxLeavePerYear);

          totalSurplus += surplus;
          
          if (surplus > 0) {
            membersWithSurplus++;
          }
          
          // Consider low balance if less than 25% of max leave remaining
          if (remainingBalance < maxLeavePerYear * 0.25) {
            membersWithLowBalance++;
          }
        }
      });
    }

    return { totalRemaining, averageRemaining, membersWithLowBalance, totalSurplus, membersWithSurplus };
  };

  const getMaternityLeaveSummary = () => {
    if (!team || !members.length) return { totalRemaining: 0, averageRemaining: 0, totalUsed: 0, membersCount: 0 };

    const maxMaternityLeaveDays = team.settings.maternityLeave?.maxDays || 90;
    const countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
    
    let totalRemaining = 0;
    let totalUsed = 0;
    let membersCount = 0;
    
    members.forEach(member => {
      if (member.role === 'member') {
        const memberRequests = allRequests.filter(req => 
          req.userId === member._id && req.status === 'approved'
        );
        
        const approvedMaternityRequests = memberRequests.filter(req => 
          req.reason && isMaternityLeave(req.reason)
        ).map(req => ({
          startDate: new Date(req.startDate),
          endDate: new Date(req.endDate),
          reason: req.reason
        }));

        const shiftSchedule = member.shiftSchedule || {
          pattern: [true, true, true, true, true, false, false],
          startDate: new Date(),
          type: 'fixed'
        };

        const remainingBalance = calculateMaternityLeaveBalance(
          maxMaternityLeaveDays,
          approvedMaternityRequests,
          countingMethod,
          shiftSchedule,
          member.manualMaternityLeaveBalance,
          member.manualMaternityYearToDateUsed
        );

        // Calculate days used
        const currentYear = new Date().getFullYear();
        const yearStart = new Date(currentYear, 0, 1);
        yearStart.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let daysUsed = 0;
        if (member.manualMaternityYearToDateUsed !== undefined) {
          daysUsed = member.manualMaternityYearToDateUsed;
        } else {
          const approvedMaternityRequestsForCalc = approvedMaternityRequests;
          daysUsed = approvedMaternityRequestsForCalc.reduce((total, req) => {
            const reqStart = new Date(req.startDate);
            const reqEnd = new Date(req.endDate);
            reqStart.setHours(0, 0, 0, 0);
            reqEnd.setHours(23, 59, 59, 999);
            
            const overlapEnd = reqEnd < today ? reqEnd : today;
            if (overlapEnd >= reqStart) {
              const days = countMaternityLeaveDays(reqStart, overlapEnd, countingMethod, shiftSchedule);
              return total + days;
            }
            return total;
          }, 0);
        }

        totalRemaining += remainingBalance;
        totalUsed += daysUsed;
        membersCount++;
      }
    });

    const averageRemaining = membersCount > 0 ? totalRemaining / membersCount : 0;

    return { totalRemaining, averageRemaining, totalUsed, membersCount };
  };

  const getOnLeaveStats = () => {
    if (!team || !members.length || !allRequests) {
      return { 
        currentlyOnLeave: 0, 
        upcomingThisWeek: 0, 
        thisMonth: 0, 
        thisYear: 0,
        byReason: {},
        currentlyOnLeaveList: []
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    const yearStart = new Date(today.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    yearEnd.setHours(23, 59, 59, 999);

    // Get ALL approved requests (including maternity)
    const approvedRequests = allRequests.filter(req => req.status === 'approved');

    // Helper function to categorize reason
    const categorizeReason = (reason: string | undefined): string => {
      if (!reason) return 'Other';
      const lowerReason = reason.toLowerCase();
      
      if (isMaternityLeave(reason)) return 'Maternity/Paternity';
      if (lowerReason.includes('sick') || lowerReason.includes('illness')) return 'Sick Leave';
      if (lowerReason.includes('vacation') || lowerReason.includes('holiday')) return 'Vacation';
      if (lowerReason.includes('personal')) return 'Personal';
      if (lowerReason.includes('family') || lowerReason.includes('emergency')) return 'Family Emergency';
      if (lowerReason.includes('medical') || lowerReason.includes('doctor') || lowerReason.includes('hospital')) return 'Medical';
      if (lowerReason.includes('bereavement') || lowerReason.includes('death') || lowerReason.includes('funeral')) return 'Bereavement';
      if (lowerReason.includes('study') || lowerReason.includes('education')) return 'Study/Education';
      if (lowerReason.includes('religious')) return 'Religious Holiday';
      
      return 'Other';
    };

    // Get unique member IDs for each category
    const currentlyOnLeaveSet = new Set<string>();
    const upcomingThisWeekSet = new Set<string>();
    const thisMonthSet = new Set<string>();
    const thisYearSet = new Set<string>();
    
    // Track breakdown by reason
    const byReason: Record<string, number> = {};
    const currentlyOnLeaveList: Array<{ memberId: string; memberName: string; reason: string; category: string }> = [];

    approvedRequests.forEach(req => {
      const reqStart = new Date(req.startDate);
      const reqEnd = new Date(req.endDate);
      reqStart.setHours(0, 0, 0, 0);
      reqEnd.setHours(23, 59, 59, 999);
      
      const memberId = String(req.userId).trim();
      const reason = req.reason || 'Other';
      const category = categorizeReason(req.reason);

      // Currently on leave: request includes today
      if (reqStart <= today && reqEnd >= today) {
        currentlyOnLeaveSet.add(memberId);
        
        // Add to list if not already added (avoid duplicates if member has multiple overlapping requests)
        if (!currentlyOnLeaveList.find(item => item.memberId === memberId)) {
          const member = members.find(m => String(m._id).trim() === memberId);
          currentlyOnLeaveList.push({
            memberId,
            memberName: member?.fullName || member?.username || 'Unknown',
            reason,
            category
          });
        }
      }

      // Upcoming this week: starts within next 7 days
      if (reqStart >= today && reqStart <= nextWeek && reqStart <= reqEnd) {
        upcomingThisWeekSet.add(memberId);
      }

      // This month: overlaps with current month
      if (reqStart <= monthEnd && reqEnd >= monthStart) {
        thisMonthSet.add(memberId);
      }

      // This year: overlaps with current year
      if (reqStart <= yearEnd && reqEnd >= yearStart) {
        thisYearSet.add(memberId);
      }
    });

    // Count unique members by reason category after building the list
    currentlyOnLeaveList.forEach(item => {
      byReason[item.category] = (byReason[item.category] || 0) + 1;
    });

    return {
      currentlyOnLeave: currentlyOnLeaveSet.size,
      upcomingThisWeek: upcomingThisWeekSet.size,
      thisMonth: thisMonthSet.size,
      thisYear: thisYearSet.size,
      byReason,
      currentlyOnLeaveList: currentlyOnLeaveList.sort((a, b) => a.memberName.localeCompare(b.memberName))
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
            <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="spinner w-16 h-16 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Leader Dashboard</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Welcome back! Here&apos;s what&apos;s happening with your team</p>
          </div>

          {/* Leader Score Card - Hero Style */}
          {analytics && (() => {
            const aggregate = analytics.aggregate;
            const totalMembers = aggregate.membersCount || members.filter(m => m.role === 'member').length;
            const totalWillLose = aggregate.totalWillLose || 0;
            const totalWillCarryover = aggregate.totalWillCarryover || 0;
            const totalRemainingBalance = aggregate.totalRemainingLeaveBalance || 0;
            const totalRealisticUsableDays = aggregate.totalRealisticUsableDays || 0;
            const averageRemainingBalance = aggregate.averageRemainingBalance || 0;
            const maxLeavePerYear = team?.settings.maxLeavePerYear || 20;
            
            // Calculate team health metrics
            const membersAtRisk = analytics.groups 
              ? analytics.groups.flatMap(g => g.members).filter(m => (m.analytics.willLose || 0) > 0).length
              : 0;
            const utilizationRate = totalMembers > 0 && maxLeavePerYear > 0
              ? ((totalMembers * maxLeavePerYear - totalRemainingBalance) / (totalMembers * maxLeavePerYear)) * 100
              : 0;
            const efficiencyRate = totalRemainingBalance > 0
              ? (totalRealisticUsableDays / totalRemainingBalance) * 100
              : 0;
            
            // Determine score and status based on team health
            let score = 'excellent';
            let gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
            let bgGradient = 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20';
            let borderColor = 'border-green-400 dark:border-green-600';
            let textColor = 'text-green-700 dark:text-green-300';
            let badgeColor = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
            let quote = '';
            let message = '';
            let scoreLabel = 'Excellent';
            
            // Score logic based on team leave situation
            if (membersAtRisk === 0 && totalWillLose === 0 && efficiencyRate >= 80) {
              // Excellent: No members at risk, good utilization
              score = 'excellent';
              gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
              bgGradient = 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20';
              borderColor = 'border-green-400 dark:border-green-600';
              textColor = 'text-green-700 dark:text-green-300';
              badgeColor = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
              quote = 'A well-rested team is a productive team. Great leadership!';
              message = 'Excellent! Your team has healthy leave utilization. No members are at risk of losing days, and the team has good access to usable leave days.';
              scoreLabel = 'Excellent';
            } else if (membersAtRisk <= totalMembers * 0.2 && efficiencyRate >= 60) {
              // Good: Few members at risk, decent utilization
              score = 'good';
              gradientColors = 'from-blue-500 via-indigo-500 to-purple-500';
              bgGradient = 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20';
              borderColor = 'border-blue-400 dark:border-blue-600';
              textColor = 'text-blue-700 dark:text-blue-300';
              badgeColor = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
              quote = 'Proactive planning prevents leave conflicts. Keep it up!';
              message = 'Good! Your team is managing leave well overall. A few members may need attention to ensure they can use their remaining days effectively.';
              scoreLabel = 'Good';
            } else if (membersAtRisk <= totalMembers * 0.4 && efficiencyRate >= 40) {
              // Fair: Some members at risk, moderate utilization
              score = 'fair';
              gradientColors = 'from-yellow-500 via-amber-500 to-orange-500';
              bgGradient = 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20';
              borderColor = 'border-yellow-400 dark:border-yellow-600';
              textColor = 'text-yellow-700 dark:text-yellow-300';
              badgeColor = 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
              quote = 'Team coordination is key to effective leave management.';
              message = 'Fair. Some team members are at risk of losing leave days. Consider coordinating with members to help them plan their remaining time off effectively.';
              scoreLabel = 'Fair';
            } else if (membersAtRisk > 0 || totalWillLose > 0) {
              // Needs attention: Members at risk or days will be lost
              score = 'needs-attention';
              gradientColors = 'from-orange-500 via-red-500 to-pink-500';
              bgGradient = 'bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20';
              borderColor = 'border-orange-400 dark:border-orange-600';
              textColor = 'text-orange-700 dark:text-orange-300';
              badgeColor = 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200';
              quote = 'Support your team by helping them use their entitled leave.';
              message = `Needs attention. ${membersAtRisk} member${membersAtRisk !== 1 ? 's' : ''} ${membersAtRisk === 1 ? 'is' : 'are'} at risk of losing leave days. ${totalWillLose > 0 ? `Approximately ${Math.round(totalWillLose)} days will be lost at year end. ` : ''}Consider proactive planning to help members utilize their leave.`;
              scoreLabel = 'Needs Attention';
            } else {
              // Critical: High risk situation
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              score = 'critical';
              gradientColors = 'from-red-600 via-rose-600 to-pink-600';
              bgGradient = 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20';
              borderColor = 'border-red-400 dark:border-red-600';
              textColor = 'text-red-700 dark:text-red-300';
              badgeColor = 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
              quote = 'Effective leave management supports team well-being and retention.';
              message = 'Requires immediate attention. Many team members are at risk of losing leave days. Consider reviewing leave policies and coordinating with members to ensure they can take their entitled time off.';
              scoreLabel = 'Requires Planning';
            }
            
            // Add messages about carryover
            if (totalWillCarryover > 0) {
              message += ` Great news: ${Math.round(totalWillCarryover)} days will carry over to next year!`;
            }
            
            return (
              <div className={`relative overflow-hidden rounded-2xl ${bgGradient} border-2 ${borderColor} shadow-xl mb-12 fade-in`}>
                {/* Decorative gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${gradientColors} opacity-10 dark:opacity-5`}></div>
                
                {/* Content */}
                <div className="relative p-8 sm:p-10 lg:p-12">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-8">
                    {/* Left side - Score badge and title */}
                    <div className="flex-shrink-0">
                      <div className="flex items-center gap-4 mb-4">
                        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradientColors} flex items-center justify-center shadow-lg`}>
                          <UsersIcon className="h-10 w-10 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Team Health Score</p>
                          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{scoreLabel}</h2>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${badgeColor} shadow-md`}>
                        {totalMembers} member{totalMembers !== 1 ? 's' : ''} • {Math.round(efficiencyRate)}% efficiency
                      </span>
                    </div>
                    
                    {/* Right side - Quote and message */}
                    <div className="flex-1 min-w-0">
                      <div className="mb-4">
                        <p className={`text-xl sm:text-2xl font-medium ${textColor} italic mb-3 leading-relaxed`}>
                          &ldquo;{quote}&rdquo;
                        </p>
                        <p className="text-base sm:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                          {message}
                        </p>
                      </div>
                      
                      {/* Quick stats */}
                      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {membersAtRisk} member{membersAtRisk !== 1 ? 's' : ''} at risk
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {Math.round(utilizationRate)}% leave utilized
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {Math.round(averageRemainingBalance)} days avg remaining
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stats Cards and On Leave Section - Side by Side Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            {/* Left: 2x2 Stats Grid */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Team Members Card */}
              <div className="stat-card group">
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Team Members</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white fade-in">
                        {members?.filter(m => m.role === 'member').length || 0}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <UsersIcon className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Requests Card */}
              <div className={`stat-card group ${pendingRequests?.length > 0 ? 'border-yellow-300 dark:border-yellow-700' : ''}`}>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Pending</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white fade-in">
                        {pendingRequests?.length || 0}
                      </p>
                      {pendingRequests?.length > 0 && (
                        <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium mt-0.5">Needs attention</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                        <ClockIcon className="h-4 w-4 text-yellow-700 dark:text-yellow-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Avg Leave Balance Card */}
              <div className="stat-card group">
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Avg Balance</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white fade-in">
                        {Math.round(getLeaveBalanceSummary().averageRemaining)}
                      </p>
                      {getLeaveBalanceSummary().membersWithLowBalance > 0 && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium mt-0.5">
                          {getLeaveBalanceSummary().membersWithLowBalance} low
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                        <ChartBarIcon className="h-4 w-4 text-green-700 dark:text-green-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Maternity Leave Summary Card */}
              <div className="stat-card group">
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Maternity</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white fade-in">
                        {Math.round(getMaternityLeaveSummary().averageRemaining)}
                      </p>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                        {Math.round(getMaternityLeaveSummary().totalUsed)} used
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      <div className="w-8 h-8 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                        <CalendarIcon className="h-4 w-4 text-pink-700 dark:text-pink-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Currently On Leave Section */}
            <div className="lg:col-span-3 card">
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Main Stat - On Leave */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <UserIcon className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                          On Leave
                        </h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          Current status
                        </p>
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                      {getOnLeaveStats().currentlyOnLeave}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">
                      Currently today
                    </p>
                  </div>

                  {/* Upcoming Stats */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Upcoming
                    </p>
                    <div className="space-y-1.5">
                      {getOnLeaveStats().upcomingThisWeek > 0 && (
                        <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 rounded p-1.5 border border-indigo-200 dark:border-indigo-800">
                          <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                            Next 7 days
                          </span>
                          <span className="text-xs font-bold text-indigo-900 dark:text-indigo-100">
                            {getOnLeaveStats().upcomingThisWeek}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 rounded p-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          This month
                        </span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          {getOnLeaveStats().thisMonth}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown by Reason */}
                  {Object.keys(getOnLeaveStats().byReason).length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        By Reason
                      </p>
                      <div className="space-y-1">
                        {Object.entries(getOnLeaveStats().byReason)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 4)
                          .map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between">
                              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{reason}</span>
                              <span className="text-xs font-semibold text-gray-900 dark:text-white ml-2">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        By Reason
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">No one on leave</p>
                    </div>
                  )}

                  {/* Currently On Leave List - People */}
                  {getOnLeaveStats().currentlyOnLeaveList.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        People ({getOnLeaveStats().currentlyOnLeaveList.length})
                      </p>
                      <div className="space-y-1 max-h-[150px] overflow-y-auto pr-2 scrollbar-thin">
                        {getOnLeaveStats().currentlyOnLeaveList.map((item) => (
                          <div 
                            key={item.memberId}
                            className="flex items-start justify-between bg-gray-50/50 dark:bg-gray-900/50 rounded p-1.5 border border-gray-200 dark:border-gray-800"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                {item.memberName}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300">
                                  {item.category}
                                </span>
                                {item.reason && item.reason !== item.category && (
                                  <p className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                    {item.reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area - Side by Side Layout for Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Pending Requests - Takes 1 column on mobile/tablet, 2 columns on desktop */}
            <div className="lg:col-span-2">
              <div className="card h-full">
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        Pending Requests
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {pendingRequests?.length || 0} request{pendingRequests?.length !== 1 ? 's' : ''} awaiting your review
                      </p>
                    </div>
                    {pendingRequests && pendingRequests.length > 0 && (
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
                          Action Required
                        </span>
                      </div>
                    )}
                  </div>
              {!pendingRequests || pendingRequests.length === 0 ? (
                <div className="text-center py-12 fade-in">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 text-lg font-semibold mb-1">All clear!</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No pending requests at the moment</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                  {pendingRequests.map((request, index) => {
                    const member = members?.find(m => m._id === request.userId);
                    return (
                      <div 
                        key={request._id} 
                        className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800/50 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 stagger-item"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                                <UserIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                                {member?.username || 'Unknown User'}
                              </h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-2">
                              <div className="flex items-center gap-1.5">
                                <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-gray-500" />
                                <span className="font-medium">
                                  {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium bg-white/50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg inline-block">
                              {request.reason}
                            </p>
                          </div>
                          <div className="flex sm:flex-col gap-2 sm:ml-4">
                            <button 
                              onClick={() => handleApprove(request._id!)}
                              disabled={processingRequest === request._id}
                              className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white text-xs sm:text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[100px] sm:min-w-[120px] transition-colors duration-200"
                            >
                              {processingRequest === request._id ? (
                                <>
                                  <div className="spinner w-4 h-4 border-2 border-white/30 border-t-white"></div>
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon className="h-4 w-4" />
                                  <span>Approve</span>
                                </>
                              )}
                            </button>
                            <button 
                              onClick={() => handleReject(request._id!)}
                              disabled={processingRequest === request._id}
                              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white text-xs sm:text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[100px] sm:min-w-[120px] transition-colors duration-200"
                            >
                              {processingRequest === request._id ? (
                                <>
                                  <div className="spinner w-4 h-4 border-2 border-white/30 border-t-white"></div>
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <XCircleIcon className="h-4 w-4" />
                                  <span>Reject</span>
                                </>
                              )}
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
            </div>

            {/* Members at Risk Sidebar - Priority List */}
            <div className="lg:col-span-1">
              <div className="card h-full">
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <FireIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Action Needed</h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Members with highest days to lose at year-end</p>
                  {(() => {
                    if (!analytics || !team || !members.length) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
                        </div>
                      );
                    }

                    // Get all members with their analytics
                    const allMembersWithAnalytics = analytics.groups.flatMap(g => g.members);
                    
                    // Create member at risk list - ONLY members who will lose days at year-end
                    // Focus on highest days to be lost
                    const membersAtRisk = allMembersWithAnalytics
                      .map(m => {
                        const member = members.find(mem => mem._id === m.userId);
                        if (!member || member.role !== 'member') return null;

                        const willLose = m.analytics.willLose || 0;
                        const remainingBalance = m.analytics.remainingLeaveBalance || 0;
                        const realisticUsableDays = m.analytics.realisticUsableDays || 0;
                        
                        // Only include members who will lose days
                        if (willLose <= 0) return null;

                        return {
                          member,
                          analytics: m.analytics,
                          willLose,
                          remainingBalance,
                          realisticUsableDays
                        };
                      })
                      .filter(m => m !== null)
                      .sort((a, b) => (b?.willLose || 0) - (a?.willLose || 0)) // Sort by highest days to lose
                      .slice(0, 5); // Show top 5 with highest days to lose

                    if (membersAtRisk.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">All Clear!</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">No members will lose days at year-end</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                        {membersAtRisk.map((item, index) => {
                          if (!item) return null;
                          const { member, willLose, remainingBalance, realisticUsableDays } = item;
                          const maxLeavePerYear = team.settings.maxLeavePerYear;
                          
                          return (
                            <div 
                              key={member._id}
                              className={`p-3 rounded-lg border transition-all duration-200 stagger-item ${
                                willLose > 0
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                              }`}
                              style={{ animationDelay: `${index * 0.05}s` }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                      {member.fullName || member.username}
                                    </p>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    {/* Focus on days to lose - this is the primary concern */}
                                    {willLose > 0 && (
                                      <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-medium">
                                        <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                        <span className="font-semibold">Will lose {Math.round(willLose)} day{willLose !== 1 ? 's' : ''} at year end</span>
                                      </div>
                                    )}
                                    {/* Show remaining balance for context */}
                                    <div className="text-gray-600 dark:text-gray-400 mt-1">
                                      {Math.round(remainingBalance)} days remaining
                                    </div>
                                    {/* Show realistic usable days if significantly less than remaining */}
                                    {realisticUsableDays < remainingBalance && remainingBalance > 0 && (
                                      <div className="text-gray-500 dark:text-gray-500 text-xs">
                                        Only {Math.round(realisticUsableDays)} realistic days available
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {index === 0 && willLose > 0 && (
                                  <div className="flex-shrink-0">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white uppercase tracking-wider">
                                      Highest Risk
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                <span className="text-xs text-gray-600 dark:text-gray-400">Balance</span>
                                <span className={`text-sm font-semibold ${
                                  remainingBalance < 0 
                                    ? (() => {
                                        const memberCompassionateRequests = allRequests.filter(req => 
                                          req.userId === member._id && 
                                          req.status === 'approved' && 
                                          req.reason && 
                                          (isMaternityLeave(req.reason) || 
                                           req.reason.toLowerCase().includes('sick') ||
                                           req.reason.toLowerCase().includes('bereavement') ||
                                           req.reason.toLowerCase().includes('medical') ||
                                           req.reason.toLowerCase().includes('family emergency') ||
                                           req.reason.toLowerCase().includes('emergency'))
                                        );
                                        return memberCompassionateRequests.length > 0
                                          ? 'text-pink-600 dark:text-pink-400'
                                          : 'text-red-600 dark:text-red-400';
                                      })()
                                    : 'text-gray-900 dark:text-white'
                                }`}>
                                  {remainingBalance < 0 
                                    ? `-${Math.round(Math.abs(remainingBalance))} / ${Math.round(maxLeavePerYear)}`
                                    : `${Math.round(remainingBalance)} / ${Math.round(maxLeavePerYear)}`
                                  }
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section - Enhanced - Full Width */}
          {analytics && (
            <div className="mb-8 space-y-8 fade-in">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3">Year-End Analytics</h2>
                <p className="text-base text-gray-500 dark:text-gray-400">Team performance metrics and insights</p>
              </div>
              
              {/* Aggregate Stats - Enhanced Cards with Gradients - Better Horizontal Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 sm:gap-8 mb-8">
                {/* Realistic Usable Days */}
                <div className="stat-card group">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Realistic Usable</p>
                        <p className="text-2xl sm:text-3xl font-bold text-indigo-700 dark:text-indigo-400 mb-1 fade-in">
                          {Math.round(analytics.aggregate.totalRealisticUsableDays ?? 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">With constraints</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ChartBarIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Theoretical Working Days */}
                <div className="stat-card group">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Theoretical Days</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-700 dark:text-gray-300 mb-1 fade-in">
                          {Math.round(analytics.aggregate.totalTheoreticalWorkingDays ?? 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">Without constraints</p>
                      </div>
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ArrowTrendingUpIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Remaining Leave</h3>
                        <div className="mt-1">
                          <div className="flex items-baseline flex-wrap gap-2">
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">
                              {Math.round(analytics.aggregate.totalRemainingLeaveBalance)}
                            </span>
                            {(() => {
                              // Get all members from groups to check for surplus
                              const allMembers = analytics.groups.flatMap(group => group.members);
                              const totalSurplus = allMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
                              
                              if (totalSurplus > 0) {
                                return (
                                  <span className="text-lg text-green-600 dark:text-green-400">
                                    (+{Math.round(totalSurplus)} surplus)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          {(() => {
                            const allMembers = analytics.groups.flatMap(group => group.members);
                            const membersWithSurplus = allMembers.filter(m => m.analytics.surplusBalance > 0);
                            if (membersWithSurplus.length > 0) {
                              return (
                                <div className="mt-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                    {membersWithSurplus.length} member(s) with surplus
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CalendarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Leave days remaining</p>
                  </div>
                </div>

                {/* Will Carry Over */}
                <div className={`stat-card group ${analytics.aggregate.totalWillCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : ''}`}>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Will Carry Over</p>
                        <p className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400 mb-1 fade-in">
                          {Math.round(analytics.aggregate.totalWillCarryover)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">To next year</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Will Be Lost */}
                <div className={`stat-card group ${analytics.aggregate.totalWillLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : ''}`}>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Will Be Lost</p>
                        <p className="text-2xl sm:text-3xl font-bold text-red-700 dark:text-red-400 mb-1 fade-in">
                          {Math.round(analytics.aggregate.totalWillLose)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">At year end</p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-700 dark:text-red-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Competition Context and Constraint Info - Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Competition Context Card */}
                <div className="card border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30">
                  <div className="p-5">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">Team Competition Context</p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-2 leading-relaxed">
                          <strong>{analytics.aggregate.membersCount}</strong> team member{analytics.aggregate.membersCount !== 1 ? 's' : ''} 
                          {' '}need to coordinate use of <strong>{Math.round(analytics.aggregate.totalRealisticUsableDays)}</strong> realistic usable days.
                          {analytics.aggregate.totalRemainderDays > 0 && (
                            <> <strong className="text-indigo-600 dark:text-indigo-400">+{analytics.aggregate.totalRemainderDays}</strong> day(s) need allocation decisions</>
                          )}
                        </p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
                          Average of <strong>{Math.round(analytics.aggregate.averageDaysPerMemberAcrossTeam)}</strong> days per member available across the team.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Availability Constraint Info */}
                {analytics.aggregate.totalRealisticUsableDays < analytics.aggregate.totalTheoreticalWorkingDays && (
                  <div className="card border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30">
                    <div className="p-5">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                          <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-orange-900 dark:text-orange-300 mb-2">Concurrent Leave Constraints Active</p>
                          <p className="text-sm text-orange-700 dark:text-orange-400 leading-relaxed">
                            Team members can realistically use <strong>{Math.round(analytics.aggregate.totalRealisticUsableDays)}</strong> of <strong>{Math.round(analytics.aggregate.totalTheoreticalWorkingDays)}</strong> theoretical working days remaining.
                            Some periods are fully booked due to concurrent leave limits.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Policy Info - Full Width */}
              {team && (
                <div className={`card ${team.settings.allowCarryover ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30'}`}>
                  <div className="p-5">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${team.settings.allowCarryover ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                        {team.settings.allowCarryover ? (
                          <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                        ) : (
                          <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white mb-1">
                          {team.settings.allowCarryover ? 'Carryover Enabled' : 'Carryover Disabled'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {team.settings.allowCarryover
                            ? 'Unused leave days will carry over to next year'
                            : 'Unused leave days will be lost at year end'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Team Leave Balances - Grouped by Tags */}
          <div className="card card-hover mb-8">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Team Leave Balances
              </h3>
              {members.filter(m => m.role === 'member').length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <UsersIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                    </div>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">No team members yet</p>
                </div>
              ) : analytics?.groups && analytics.groups.length > 0 ? (() => {
                // Group by subgroup if subgrouping is enabled
                const groupBySubgroup = (groups: typeof analytics.groups) => {
                  const subgroupMap = new Map<string, typeof groups>();
                  for (const group of groups) {
                    const subgroupKey = group.subgroupTag || 'Ungrouped';
                    if (!subgroupMap.has(subgroupKey)) {
                      subgroupMap.set(subgroupKey, []);
                    }
                    subgroupMap.get(subgroupKey)!.push(group);
                  }
                  return subgroupMap;
                };

                const subgroupMap = team?.settings.enableSubgrouping 
                  ? groupBySubgroup(analytics.groups) 
                  : new Map([['All', analytics.groups]]);

                return (
                  <div className="space-y-8">
                    {Array.from(subgroupMap.entries()).map(([subgroupName, subgroupGroups]) => (
                      <div key={subgroupName} className="border-t border-gray-200 dark:border-gray-800 pt-6 first:border-t-0 first:pt-0">
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                          {team?.settings.enableSubgrouping ? (
                            <>
                              Subgroup: <span className="text-indigo-600 dark:text-indigo-400">{subgroupName}</span>
                            </>
                          ) : (
                            'All Members'
                          )}
                        </h4>
                        <div className="space-y-6">
                          {subgroupGroups.map((group, index) => (
                            <div key={group.groupKey || index} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                              <h5 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-2">
                                <span className="flex items-center gap-2 flex-wrap">
                                  <span>{group.shiftTag ? `${group.shiftTag} Shift` : 'No Shift Tag'}</span>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                    {getWorkingDaysGroupDisplayName(group.workingDaysTag, team?.settings)}
                                    {team?.settings?.workingDaysGroupNames?.[group.workingDaysTag] && (
                                      <span className="ml-1 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
                                        ({group.workingDaysTag})
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </h5>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                Members in this group: {group.aggregate.groupTotalMembers}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                                <div className="bg-white dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-800">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg. Usable Days</p>
                                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{Math.round(group.aggregate.groupAverageUsableDays)}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-800">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg. Realistic Usable Days</p>
                                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{Math.round(group.aggregate.groupAverageRealisticUsableDays)}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-800">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg. Remaining Balance</p>
                                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{Math.round(group.aggregate.groupAverageLeaveBalance)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })() : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No analytics data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
