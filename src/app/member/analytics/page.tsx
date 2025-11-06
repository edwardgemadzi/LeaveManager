'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, User } from '@/types';
import { MemberAnalytics, MaternityMemberAnalytics, getMaternityMemberAnalytics } from '@/lib/analyticsCalculations';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { 
  ChartBarIcon, 
  CheckCircleIcon, 
  ArrowTrendingUpIcon, 
  UsersIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

import { LeaveRequest, ShiftSchedule } from '@/types';
import { countWorkingDays, isMaternityLeave } from '@/lib/leaveCalculations';

export default function MemberAnalyticsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [analytics, setAnalytics] = useState<MemberAnalytics | null>(null);
  const [maternityAnalytics, setMaternityAnalytics] = useState<MaternityMemberAnalytics | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(userData);

      // Fetch dashboard data (which includes requests)
      const dashboardResponse = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!dashboardResponse.ok) {
        console.error('Failed to fetch dashboard data:', dashboardResponse.status, dashboardResponse.statusText);
        return;
      }

      const data = await dashboardResponse.json();
      
      setTeam(data.team);
      if (data.currentUser) {
        setUser(data.currentUser);
      }
      
      // Set analytics (structure for members: { analytics: MemberAnalytics })
      if (data.analytics && data.analytics.analytics) {
        setAnalytics(data.analytics.analytics);
      }

      // Set leave requests (filter to current user's requests from dashboard response)
      // The dashboard API already returns allRequests, so we filter to current user
      const currentUserId = data.currentUser?._id || userData.id;
      const allRequests = data.requests || [];
      const userRequests = allRequests.filter((req: LeaveRequest) => {
        const reqUserId = String(req.userId || '').trim();
        const userId = String(currentUserId || '').trim();
        return reqUserId === userId;
      });
      setLeaveRequests(userRequests);

      // Calculate maternity analytics if user has maternity/paternity type assigned and it's enabled
      if (data.currentUser?.maternityPaternityType && data.team) {
        const userType = data.currentUser.maternityPaternityType;
        const isTypeEnabled = userType === 'paternity' 
          ? data.team.settings.paternityLeave?.enabled 
          : data.team.settings.maternityLeave?.enabled;
        
        if (isTypeEnabled) {
          const approvedRequests = userRequests.filter((req: LeaveRequest) => req.status === 'approved');
          const maternityAnalyticsData = getMaternityMemberAnalytics(
            data.currentUser,
            data.team,
            approvedRequests
          );
          setMaternityAnalytics(maternityAnalyticsData);
        } else {
          setMaternityAnalytics(null);
        }
      } else {
        setMaternityAnalytics(null);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  useEffect(() => {
    fetchData();
    
    // Listen for settings updates to refresh analytics
    const handleSettingsUpdated = () => {
      setTimeout(() => {
        fetchData();
      }, 200);
    };
    
    window.addEventListener('teamSettingsUpdated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('teamSettingsUpdated', handleSettingsUpdated);
    };
  }, []);

  // Real-time updates using SSE
  useTeamEvents(team?._id || null, {
    enabled: !loading && !!user && !!team,
    onEvent: (event) => {
      // Refresh analytics when leave requests are updated or settings change
      if (event.type === 'leaveRequestUpdated' || event.type === 'leaveRequestDeleted' || event.type === 'settingsUpdated') {
        // Debounce refresh to avoid excessive API calls
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        refreshTimeoutRef.current = setTimeout(() => {
          fetchData();
        }, 300);
      }
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="spinner w-16 h-16 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics || !team) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">No analytics data available</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {!analytics ? 'Analytics data not loaded' : ''}
              {!team ? 'Team data not loaded' : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.floor((yearEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Helper functions for analytics calculations
  const shiftSchedule: ShiftSchedule = user?.shiftSchedule || {
    pattern: [true, true, true, true, true, false, false],
    startDate: new Date(),
    type: 'fixed'
  };

  // Calculate monthly usage breakdown
  const getMonthlyUsage = () => {
    const monthlyUsage: Record<number, number> = {};
    const approvedRequests = leaveRequests.filter(req => req.status === 'approved' && !isMaternityLeave(req.reason || ''));
    
    // Initialize all months to 0
    for (let i = 0; i < 12; i++) {
      monthlyUsage[i] = 0;
    }
    
    approvedRequests.forEach(req => {
      // Handle both Date objects and date strings (from JSON serialization)
      const start = req.startDate instanceof Date ? new Date(req.startDate) : new Date(req.startDate);
      const end = req.endDate instanceof Date ? new Date(req.endDate) : new Date(req.endDate);
      
      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return;
      }
      
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      // Only count requests in current year (allow requests that overlap with current year)
      // This matches the logic in getMemberAnalytics
      if (start <= yearEnd && end >= yearStart) {
        const overlapStart = start > yearStart ? start : yearStart;
        const overlapEnd = end < yearEnd ? end : yearEnd;
        
        if (overlapEnd >= overlapStart) {
          // Group by month - iterate through each month in the overlap period
          const current = new Date(overlapStart);
          while (current <= overlapEnd) {
            const month = current.getMonth();
            const monthStart = new Date(current.getFullYear(), month, 1);
            const monthEnd = new Date(current.getFullYear(), month + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);
            
            const monthOverlapStart = current > monthStart ? current : monthStart;
            const monthOverlapEnd = overlapEnd < monthEnd ? overlapEnd : monthEnd;
            
            if (monthOverlapEnd >= monthOverlapStart) {
              const days = countWorkingDays(monthOverlapStart, monthOverlapEnd, shiftSchedule);
              monthlyUsage[month] = (monthlyUsage[month] || 0) + days;
            }
            
            // Move to next month
            current.setMonth(current.getMonth() + 1);
            current.setDate(1);
          }
        }
      }
    });
    
    return monthlyUsage;
  };

  // Calculate request patterns
  const getRequestPatterns = () => {
    const approvedRequests = leaveRequests.filter(req => req.status === 'approved' && !isMaternityLeave(req.reason || ''));
    const pendingRequests = leaveRequests.filter(req => req.status === 'pending');
    const rejectedRequests = leaveRequests.filter(req => req.status === 'rejected');
    
    // Average duration
    const durations = approvedRequests.map(req => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      return countWorkingDays(start, end, shiftSchedule);
    });
    const avgDuration = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
    
    // Most common reasons
    const reasonCounts: Record<string, number> = {};
    approvedRequests.forEach(req => {
      const reason = req.reason || 'Other';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    const mostCommonReason = Object.entries(reasonCounts).sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0]?.[0] || 'N/A';
    
    // Request frequency (average days between requests)
    const sortedRequests = approvedRequests.sort((a: LeaveRequest, b: LeaveRequest) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    let totalDaysBetween = 0;
    for (let i = 1; i < sortedRequests.length; i++) {
      const prevEnd = new Date(sortedRequests[i - 1].endDate);
      const currStart = new Date(sortedRequests[i].startDate);
      const daysBetween = Math.floor((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));
      totalDaysBetween += daysBetween;
    }
    const avgDaysBetween = sortedRequests.length > 1 ? totalDaysBetween / (sortedRequests.length - 1) : 0;
    
    // Preferred months
    const monthCounts: Record<number, number> = {};
    approvedRequests.forEach(req => {
      const start = new Date(req.startDate);
      const month = start.getMonth();
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
    const preferredMonths = Object.entries(monthCounts)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 3)
      .map(([month]: [string, number]) => parseInt(month, 10));
    
    return {
      totalApproved: approvedRequests.length,
      totalPending: pendingRequests.length,
      totalRejected: rejectedRequests.length,
      avgDuration: Math.round(avgDuration * 10) / 10,
      mostCommonReason,
      avgDaysBetween: Math.round(avgDaysBetween),
      preferredMonths
    };
  };

  // Calculate efficiency metrics
  const getEfficiencyMetrics = () => {
    const baseBalance = analytics.baseLeaveBalance ?? (team?.settings.maxLeavePerYear || 20);
    const used = baseBalance - (analytics.remainingLeaveBalance ?? 0);
    const usageEfficiency = baseBalance > 0 ? (used / baseBalance) * 100 : 0;
    
    // Planning efficiency (advance notice)
    const approvedRequests = leaveRequests.filter(req => req.status === 'approved' && !isMaternityLeave(req.reason || ''));
    let totalAdvanceNotice = 0;
    approvedRequests.forEach(req => {
      const requestDate = new Date(req.createdAt);
      const startDate = new Date(req.startDate);
      const daysNotice = Math.floor((startDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
      totalAdvanceNotice += Math.max(0, daysNotice);
    });
    const avgAdvanceNotice = approvedRequests.length > 0 ? totalAdvanceNotice / approvedRequests.length : 0;
    const planningEfficiency = avgAdvanceNotice >= team?.settings.minimumNoticePeriod ? 100 : (avgAdvanceNotice / (team?.settings.minimumNoticePeriod || 1)) * 100;
    
    // Balance efficiency (distribution throughout year)
    // Measures how well leave is distributed across elapsed months
    const monthlyUsage = getMonthlyUsage();
    // Count only months with actual usage (> 0 days)
    const monthsWithUsage = Object.values(monthlyUsage).filter(days => days > 0).length;
    
    // Calculate elapsed months (how many months have passed in the current year)
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-11 (January = 0)
    const elapsedMonths = currentMonth + 1; // +1 because we're in the current month
    
    // Balance efficiency = (months with usage / elapsed months) * 100
    // This measures how well leave is distributed across the elapsed period
    // Example: If we're in June (6 months elapsed) and user has used leave in 4 months, efficiency = 4/6 = 66.7%
    // If user has used leave in all 6 months, efficiency = 100%
    // Cap at 100% (can't exceed 100% efficiency)
    const balanceEfficiency = elapsedMonths > 0 
      ? Math.min(100, (monthsWithUsage / elapsedMonths) * 100)
      : 0;
    
    return {
      usageEfficiency: Math.round(usageEfficiency * 10) / 10,
      planningEfficiency: Math.round(planningEfficiency * 10) / 10,
      balanceEfficiency: Math.round(balanceEfficiency * 10) / 10,
      avgAdvanceNotice: Math.round(avgAdvanceNotice)
    };
  };

  // Calculate optimal usage recommendations
  const getOptimalRecommendations = () => {
    const recommendations: string[] = [];
    const remainingBalance = analytics.remainingLeaveBalance ?? 0;
    const remainingWorkingDays = analytics.theoreticalWorkingDays ?? 0;
    const realisticUsable = analytics.realisticUsableDays ?? 0;
    const willLose = analytics.willLose ?? 0;
    const willCarryover = analytics.willCarryover ?? 0;
    const carryoverLimitedMonths = analytics.carryoverLimitedToMonths;
    const carryoverMaxDays = analytics.carryoverMaxDays;
    const carryoverExpiryDate = analytics.carryoverExpiryDate;
    
    // Risk of losing days
    if (willLose > 0) {
      recommendations.push(`⚠️ You will lose ${Math.round(willLose)} days at year end. Plan to use them before the year ends.`);
    }
    
    // Carryover limitations
    const realisticCarryoverUsable = analytics.realisticCarryoverUsableDays ?? 0;
    const daysLostToCarryoverLimits = willCarryover > 0 ? Math.max(0, willCarryover - realisticCarryoverUsable) : 0;
    
    if (willCarryover > 0 && carryoverLimitedMonths && carryoverLimitedMonths.length > 0) {
      const monthNames = carryoverLimitedMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
      if (daysLostToCarryoverLimits > 0) {
        recommendations.push(`📅 ${Math.round(willCarryover)} days will carry over but can only be used in ${monthNames} of next year. However, ${Math.round(daysLostToCarryoverLimits)} days will be lost due to carryover limitations. Plan accordingly.`);
      } else {
        recommendations.push(`📅 ${Math.round(willCarryover)} days will carry over but can only be used in ${monthNames} of next year. Plan accordingly.`);
      }
    }
    
    if (willCarryover > 0 && carryoverMaxDays && willCarryover > carryoverMaxDays) {
      recommendations.push(`⚠️ You have ${Math.round(willCarryover)} days that will carry over, but only ${carryoverMaxDays} days are allowed. ${Math.round(willCarryover - carryoverMaxDays)} days will be lost.`);
    }
    
    // Days lost due to carryover limitations (when realisticCarryoverUsableDays < willCarryover)
    if (willCarryover > 0 && daysLostToCarryoverLimits > 0 && (!carryoverMaxDays || willCarryover <= carryoverMaxDays)) {
      recommendations.push(`⚠️ ${Math.round(daysLostToCarryoverLimits)} days will be lost due to carryover limitations, even though they will carry over.`);
    }
    
    if (willCarryover > 0 && carryoverExpiryDate) {
      const expiryDate = new Date(carryoverExpiryDate);
      recommendations.push(`⏰ Carryover days expire on ${expiryDate.toLocaleDateString()}. Use them before this date.`);
    }
    
    // Competition recommendations
    if (analytics.membersSharingSameShift > 1 && analytics.averageDaysPerMember < remainingBalance * 0.5) {
      recommendations.push(`👥 High competition: ${analytics.membersSharingSameShift} members share your shift. Coordinate early to secure your preferred dates.`);
    }
    
    // Usage recommendations
    if (remainingBalance > remainingWorkingDays) {
      recommendations.push(`📊 You have ${Math.round(remainingBalance)} days remaining but only ${Math.round(remainingWorkingDays)} working days left. Consider using leave more frequently.`);
    }
    
    // Realistic usage recommendations
    if (realisticUsable < remainingBalance * 0.7) {
      recommendations.push(`💡 You can realistically use ${Math.round(realisticUsable)} of your ${Math.round(remainingBalance)} remaining days due to competition and constraints.`);
    }
    
    // Year progress recommendations
    const yearProgress = daysElapsed / (daysElapsed + daysRemaining);
    const usageProgress = (analytics.workingDaysUsed ?? 0) / (analytics.workingDaysInYear ?? 1);
    if (yearProgress > 0.5 && usageProgress < yearProgress * 0.7) {
      recommendations.push(`📈 You're ${Math.round(yearProgress * 100)}% through the year but have only used ${Math.round(usageProgress * 100)}% of your leave. Consider planning more leave.`);
    }
    
    return recommendations;
  };

  // Calculate risk analysis
  const getRiskAnalysis = () => {
    const remainingBalance = analytics.remainingLeaveBalance ?? 0;
    const remainingWorkingDays = analytics.theoreticalWorkingDays ?? 0;
    const willLose = analytics.willLose ?? 0;
    const willCarryover = analytics.willCarryover ?? 0;
    const carryoverLimitedMonths = analytics.carryoverLimitedToMonths;
    const carryoverMaxDays = analytics.carryoverMaxDays;
    
    let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
    let riskScore = 0;
    const risks: string[] = [];
    const mitigations: string[] = [];
    
    // Risk of losing days
    if (willLose > 0) {
      riskScore += willLose * 10;
      risks.push(`${Math.round(willLose)} days will be lost at year end`);
      mitigations.push(`Use ${Math.round(willLose)} days before the year ends`);
    }
    
    // Risk of carryover limitations
    if (willCarryover > 0 && carryoverLimitedMonths && carryoverLimitedMonths.length > 0) {
      riskScore += 5;
      risks.push(`Carryover days limited to specific months`);
      const monthNames = carryoverLimitedMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
      mitigations.push(`Plan to use carryover days in ${monthNames}`);
    }
    
    if (willCarryover > 0 && carryoverMaxDays && willCarryover > carryoverMaxDays) {
      riskScore += (willCarryover - carryoverMaxDays) * 10;
      risks.push(`${Math.round(willCarryover - carryoverMaxDays)} carryover days will exceed limit`);
      mitigations.push(`Reduce carryover to ${carryoverMaxDays} days or less`);
    }
    
    // Risk of competition
    if (analytics.membersSharingSameShift > 1 && analytics.averageDaysPerMember < remainingBalance * 0.5) {
      riskScore += 15;
      risks.push(`High competition for available days`);
      mitigations.push(`Coordinate early with team members`);
    }
    
    // Risk of insufficient time
    if (remainingBalance > remainingWorkingDays) {
      riskScore += 10;
      risks.push(`More days remaining than working days available`);
      mitigations.push(`Plan leave more frequently throughout the year`);
    }
    
    // Determine risk level
    if (riskScore >= 30) {
      riskLevel = 'High';
    } else if (riskScore >= 15) {
      riskLevel = 'Medium';
    }
    
    return {
      riskLevel,
      riskScore,
      risks,
      mitigations
    };
  };

  const monthlyUsage = getMonthlyUsage();
  const requestPatterns = getRequestPatterns();
  const efficiencyMetrics = getEfficiencyMetrics();
  const optimalRecommendations = getOptimalRecommendations();
  const riskAnalysis = getRiskAnalysis();

  return (
    <ProtectedRoute requiredRole="member">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">My Leave Analytics</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400 mb-2">
              Detailed analytics and insights for {currentYear}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {daysElapsed} days elapsed, {daysRemaining} days remaining in the year
            </p>
          </div>

          {/* Analytics Cards - Enhanced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Realistic Usable</p>
                      <button
                        onClick={() => toggleSection('realistic-usable')}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="What does this mean?"
                      >
                        <InformationCircleIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(analytics.realisticUsableDays ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">With constraints</p>
                    {expandedSections.has('realistic-usable') && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        <p className="font-semibold mb-1">Realistic Usable Days:</p>
                        <p>This is the number of days you can realistically use, considering team competition and concurrent leave limits. It accounts for carryover limitations if set.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <ChartBarIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Usable Days</p>
                      <button
                        onClick={() => toggleSection('usable-days')}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="What does this mean?"
                      >
                        <InformationCircleIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(analytics.usableDays ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">Available</p>
                    {expandedSections.has('usable-days') && (
                      <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        <p className="font-semibold mb-1">Usable Days:</p>
                        <p>Days that can be used when shared among members who can use them, adjusted for concurrent leave limits.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-purple-700 dark:text-purple-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Theoretical Days</p>
                      <button
                        onClick={() => toggleSection('theoretical-days')}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="What does this mean?"
                      >
                        <InformationCircleIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-700 dark:text-gray-300 mb-1 fade-in">
                      {Math.round(analytics.theoreticalWorkingDays ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">Without constraints</p>
                    {expandedSections.has('theoretical-days') && (
                      <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        <p className="font-semibold mb-1">Theoretical Working Days:</p>
                        <p>Total working days remaining from today to end of year, not adjusted for concurrent leave sharing.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                      <ArrowTrendingUpIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Team Competition</p>
                      <button
                        onClick={() => toggleSection('team-competition')}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="What does this mean?"
                      >
                        <InformationCircleIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {analytics.membersSharingSameShift ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">Same shift members</p>
                    {expandedSections.has('team-competition') && (
                      <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                        <p className="font-semibold mb-1">Team Competition:</p>
                        <p>Number of team members with the same working days pattern and shift type who compete for the same available days.</p>
                      </div>
                    )}
                    {analytics.averageDaysPerMember !== undefined && analytics.averageDaysPerMember > 0 && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1">
                        ~{Math.round(analytics.averageDaysPerMember)} days avg per member
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                      <UsersIcon className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Competition Context Card - Enhanced */}
          <div className="card border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 mb-8">
            <div className="p-5">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">Competition Context</p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-2 leading-relaxed">
                    <strong>{analytics.membersSharingSameShift}</strong> team member{analytics.membersSharingSameShift !== 1 ? 's' : ''} 
                    {' '}with the <strong>same working days pattern</strong> and <strong>shift type</strong> need to coordinate use of 
                    {' '}<strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days.
                  </p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
                    Average of <strong>{Math.round(analytics.averageDaysPerMember)}</strong> days per member available.
                    You can realistically use <strong>{Math.round(analytics.realisticUsableDays ?? 0)}</strong> days.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Warning Cards - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* High Competition Warning */}
            {analytics.averageDaysPerMember < analytics.remainingLeaveBalance * 0.5 && (
              <div className="card border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30">
                <div className="p-5">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                      <ExclamationTriangleIcon className="h-6 w-6 text-red-700 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-red-900 dark:text-red-300 mb-2">High Demand Alert</p>
                      <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed">
                        You have <strong>{Math.round(analytics.remainingLeaveBalance)}</strong> leave days remaining, but on average only <strong>{Math.round(analytics.averageDaysPerMember)}</strong> days per member are available.
                        Consider coordinating with your team members to avoid conflicts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Availability Warning */}
            {analytics.usableDays < analytics.theoreticalWorkingDays && (
              <div className="card border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30">
                <div className="p-5">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                      <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-orange-900 dark:text-orange-300 mb-2">Concurrent Leave Constraint</p>
                      <p className="text-sm text-orange-700 dark:text-orange-400 leading-relaxed">
                        Due to concurrent leave limits, you have <strong>{Math.round(analytics.usableDays ?? 0)}</strong> usable days of <strong>{Math.round(analytics.theoreticalWorkingDays)}</strong> remaining working days.
                        Some days are already booked by other team members.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Year-End Outlook Card - Enhanced */}
          <div className={`card mb-8 ${analytics.willLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : analytics.willCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-gray-300 dark:border-gray-700'}`}>
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Year-End Outlook</h3>
              
              {analytics.allowCarryover ? (
                <div>
                  {analytics.willCarryover > 0 ? (
                    <div className="mb-4">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                          <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{Math.round(analytics.willCarryover)} days</p>
                          <p className="text-sm text-green-600 dark:text-green-400">will carry over to next year</p>
                        </div>
                      </div>
                      {/* Realistic Carryover Usage */}
                      {analytics.realisticCarryoverUsableDays !== undefined && analytics.realisticCarryoverUsableDays > 0 && (
                        <div className="ml-16 mt-3 p-4 bg-teal-50 dark:bg-teal-900/30 rounded-lg border border-teal-200 dark:border-teal-800">
                          <div className="flex items-start space-x-3">
                            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                              <LightBulbIcon className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-teal-900 dark:text-teal-300 mb-1">
                                Realistic Carryover Usage
                              </p>
                              <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 mb-2">
                                {Math.round(analytics.realisticCarryoverUsableDays)} days
                              </p>
                              <p className="text-xs text-teal-700 dark:text-teal-400 leading-relaxed">
                                {analytics.carryoverLimitedToMonths && analytics.carryoverLimitedToMonths.length > 0 ? (
                                  <>
                                    Effective days you can realistically use from your carryover balance, considering the limited usage period. 
                                    Since carryover days can only be used in{' '}
                                    {analytics.carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ')}, 
                                    the effective value is reduced.
                                  </>
                                ) : (
                                  <>
                                    Effective days you can realistically use from your carryover balance next year.
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Days Lost Due to Carryover Limits */}
                      {(() => {
                        const willCarryover = analytics.willCarryover ?? 0;
                        const realisticUsable = analytics.realisticCarryoverUsableDays ?? 0;
                        const daysLost = willCarryover - realisticUsable;
                        
                        if (daysLost > 0) {
                          return (
                            <div className="ml-16 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                              <p className="text-xs font-semibold text-red-900 dark:text-red-300 mb-1">⚠️ Days That Will Be Lost:</p>
                              <p className="text-xs text-red-800 dark:text-red-400">
                                {Math.round(daysLost)} days will be lost due to carryover limitations, even though they will carry over.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      {/* Carryover Limitations */}
                      {analytics.carryoverLimitedToMonths && analytics.carryoverLimitedToMonths.length > 0 && (
                        <div className="ml-16 mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-300 mb-1">⚠️ Limited Usage Period:</p>
                          <p className="text-xs text-yellow-800 dark:text-yellow-400">
                            Carryover days can only be used in:{' '}
                            {analytics.carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ')}
                          </p>
                        </div>
                      )}
                      {analytics.carryoverMaxDays && analytics.willCarryover > analytics.carryoverMaxDays && (
                        <div className="ml-16 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <p className="text-xs font-semibold text-red-900 dark:text-red-300 mb-1">⚠️ Maximum Limit:</p>
                          <p className="text-xs text-red-800 dark:text-red-400">
                            Only {analytics.carryoverMaxDays} days can carry over. {Math.round(analytics.willCarryover - analytics.carryoverMaxDays)} days will be lost.
                          </p>
                        </div>
                      )}
                      {analytics.carryoverExpiryDate && (
                        <div className="ml-16 mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <p className="text-xs font-semibold text-orange-900 dark:text-orange-300 mb-1">⏰ Expiry Date:</p>
                          <p className="text-xs text-orange-800 dark:text-orange-400">
                            Carryover days expire on {new Date(analytics.carryoverExpiryDate).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                        <CheckCircleIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">No days to carry over</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">All leave will be used or retained</p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    Your team allows leave carryover. Unused days will be available next year.
                  </p>
                </div>
              ) : (
                <div>
                  {analytics.willLose > 0 ? (
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-700 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-700 dark:text-red-400">{Math.round(analytics.willLose)} days</p>
                        <p className="text-sm text-red-600 dark:text-red-400">will be lost at year end</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                        <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-green-700 dark:text-green-400">No days will be lost</p>
                        <p className="text-sm text-green-600 dark:text-green-400">All remaining leave can be used</p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    Your team does not allow leave carryover. Unused days will be lost at year end.
                  </p>
                </div>
              )}

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
                  <span>Leave Balance Usage</span>
                  {(() => {
                    const baseBalance = analytics.baseLeaveBalance ?? (team?.settings.maxLeavePerYear || 20);
                    const used = baseBalance - (analytics.remainingLeaveBalance ?? 0);
                    return (
                      <span>{Math.round(used)} / {Math.round(baseBalance)} leave days</span>
                    );
                  })()}
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3">
                  {(() => {
                    const baseBalance = analytics.baseLeaveBalance ?? (team?.settings.maxLeavePerYear || 20);
                    const used = baseBalance - (analytics.remainingLeaveBalance ?? 0);
                    const percentage = baseBalance > 0 ? Math.min(100, (used / baseBalance) * 100) : 0;
                    return (
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {(() => {
                    const baseBalance = analytics.baseLeaveBalance ?? (team?.settings.maxLeavePerYear || 20);
                    const used = baseBalance - (analytics.remainingLeaveBalance ?? 0);
                    const percentage = baseBalance > 0 ? Math.round((used / baseBalance) * 100) : 0;
                    return `${percentage}% of leave balance used this year`;
                  })()}
                </p>
              </div>
            </div>
          </div>

          {/* Leave Balance Summary Card */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Leave Balance Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Remaining Balance</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {Math.round(analytics.remainingLeaveBalance ?? 0)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">out of {team?.settings.maxLeavePerYear || 20} days</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Working Days Used</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {Math.round(analytics.workingDaysUsed ?? 0)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">this year</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Surplus Balance</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {Math.round(analytics.surplusBalance ?? 0)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">additional days</p>
                </div>
              </div>
            </div>
          </div>

          {/* Maternity/Paternity Leave Section */}
          {(() => {
            const userType = user?.maternityPaternityType;
            const hasTypeAssigned = !!userType;
            const isTypeEnabled = userType === 'paternity' 
              ? team?.settings.paternityLeave?.enabled 
              : userType === 'maternity' 
                ? team?.settings.maternityLeave?.enabled 
                : false;
            
            // Show "Not available" if type is assigned but not enabled
            if (hasTypeAssigned && !isTypeEnabled) {
              return (
                <div className="card mb-8 border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 opacity-60">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <CalendarIcon className="h-6 w-6 text-gray-400 dark:text-gray-600" />
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {userType === 'maternity' ? '🤱 Maternity Leave' : '👨‍👩‍👧 Paternity Leave'}
                      </h3>
                    </div>
                    <div className="text-center py-8">
                      <p className="text-lg font-medium text-gray-400 dark:text-gray-500 italic mb-2">
                        Not available
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500">
                        {userType === 'maternity' ? 'Maternity' : 'Paternity'} leave is not enabled for your team
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            
            // Show normal section if type is assigned, enabled, and analytics exist
            if (hasTypeAssigned && isTypeEnabled && maternityAnalytics) {
              return (
            <div className="card mb-8 border-2 border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/30">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CalendarIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {user.maternityPaternityType === 'maternity' ? '🤱 Maternity Leave' : '👨‍👩‍👧 Paternity Leave'}
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-900/50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Remaining Balance</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {Math.round(maternityAnalytics.remainingMaternityLeaveBalance)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      out of {(() => {
                        const userType = user.maternityPaternityType;
                        return userType === 'paternity'
                          ? (team?.settings.paternityLeave?.maxDays || 90)
                          : (team?.settings.maternityLeave?.maxDays || 90);
                      })()} days
                    </p>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-900/50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Days Used</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {Math.round(maternityAnalytics.maternityDaysUsed)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">this year</p>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-900/50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Base Balance</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {Math.round(maternityAnalytics.baseMaternityLeaveBalance)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">allocated</p>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-900/50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Usage Progress</p>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-4">
                        <div
                          className={`h-4 rounded-full transition-all duration-300 ${
                            maternityAnalytics.baseMaternityLeaveBalance > 0
                              ? 'bg-pink-600 dark:bg-pink-500'
                              : 'bg-gray-300 dark:bg-gray-700'
                          }`}
                          style={{
                            width: `${Math.min(
                              (maternityAnalytics.maternityDaysUsed / Math.max(maternityAnalytics.baseMaternityLeaveBalance, 1)) * 100,
                              100
                            )}%`
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {maternityAnalytics.baseMaternityLeaveBalance > 0
                          ? Math.round((maternityAnalytics.maternityDaysUsed / maternityAnalytics.baseMaternityLeaveBalance) * 100)
                          : 0}% used
                      </p>
                    </div>
                  </div>
                </div>

                {/* Maternity/Paternity Leave Request History */}
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Request History</h4>
                  {(() => {
                    const userType = user.maternityPaternityType;
                    const maternityRequests = leaveRequests.filter(req => {
                      if (req.status !== 'approved' || !req.reason) return false;
                      const lowerReason = req.reason.toLowerCase();
                      
                      if (userType === 'paternity') {
                        return lowerReason.includes('paternity') && !lowerReason.includes('maternity');
                      } else {
                        return lowerReason.includes('maternity') || (isMaternityLeave(req.reason) && !lowerReason.includes('paternity'));
                      }
                    });

                    if (maternityRequests.length === 0) {
                      return (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                          No {userType === 'maternity' ? 'maternity' : 'paternity'} leave requests yet.
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {maternityRequests.map((req) => {
                          const startDate = new Date(req.startDate);
                          const endDate = new Date(req.endDate);
                          const days = countWorkingDays(startDate, endDate, user?.shiftSchedule || {
                            pattern: [true, true, true, true, true, false, false],
                            startDate: new Date(),
                            type: 'fixed'
                          });
                          
                          return (
                            <div key={req._id} className="bg-white dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {days} {days === 1 ? 'day' : 'days'} • {req.reason}
                                  </p>
                                </div>
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                  Approved
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
              );
            }
            
            // Don't show anything if no type assigned
            return null;
          })()}

          {/* Monthly Usage Breakdown */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Usage Breakdown</h3>
                <button
                  onClick={() => toggleSection('monthly-usage')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="What does this mean?"
                >
                  <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
              {expandedSections.has('monthly-usage') && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-semibold mb-1">Monthly Usage Breakdown:</p>
                  <p>Shows how many working days you&apos;ve used each month this year. This helps identify usage patterns and trends.</p>
                </div>
              )}
              {Object.values(monthlyUsage).every(days => days === 0) ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">No leave usage data available for this year.</p>
                  <p className="text-xs mt-2">Approved leave requests will appear here once you have taken leave.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                    const days = monthlyUsage[index] || 0;
                    const allValues = Object.values(monthlyUsage);
                    const maxDays = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
                    const percentage = maxDays > 0 ? (days / maxDays) * 100 : 0;
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300">{month}</div>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-800 rounded-full h-6 relative">
                          <div
                            className={`h-6 rounded-full transition-all duration-300 ${
                              days > 0 ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'
                            }`}
                            style={{ width: `${Math.max(percentage, days > 0 ? 5 : 0)}%` }}
                          ></div>
                        </div>
                        <div className="w-20 text-right text-sm font-semibold text-gray-900 dark:text-white">
                          {days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : '0 days'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Optimal Usage Recommendations */}
          {optimalRecommendations.length > 0 && (
            <div className="card mb-8 border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <LightBulbIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Optimal Usage Recommendations</h3>
                </div>
                <ul className="space-y-2">
                  {optimalRecommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Risk Analysis */}
          <div className={`card mb-8 border-2 ${
            riskAnalysis.riskLevel === 'High' ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' :
            riskAnalysis.riskLevel === 'Medium' ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30' :
            'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30'
          }`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ExclamationTriangleIcon className={`h-6 w-6 ${
                    riskAnalysis.riskLevel === 'High' ? 'text-red-700 dark:text-red-400' :
                    riskAnalysis.riskLevel === 'Medium' ? 'text-orange-700 dark:text-orange-400' :
                    'text-green-700 dark:text-green-400'
                  }`} />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Risk Analysis</h3>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  riskAnalysis.riskLevel === 'High' ? 'bg-red-200 dark:bg-red-900/50 text-red-900 dark:text-red-300' :
                  riskAnalysis.riskLevel === 'Medium' ? 'bg-orange-200 dark:bg-orange-900/50 text-orange-900 dark:text-orange-300' :
                  'bg-green-200 dark:bg-green-900/50 text-green-900 dark:text-green-300'
                }`}>
                  {riskAnalysis.riskLevel} Risk
                </span>
              </div>
              {riskAnalysis.risks.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Identified Risks:</p>
                  <ul className="space-y-1">
                    {riskAnalysis.risks.map((risk, index) => (
                      <li key={index} className="text-sm text-gray-700 dark:text-gray-300">• {risk}</li>
                    ))}
                  </ul>
                </div>
              )}
              {riskAnalysis.mitigations.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Mitigation Strategies:</p>
                  <ul className="space-y-1">
                    {riskAnalysis.mitigations.map((mitigation, index) => (
                      <li key={index} className="text-sm text-gray-700 dark:text-gray-300">✓ {mitigation}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Request History Patterns */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Request History Patterns</h3>
                <button
                  onClick={() => toggleSection('request-patterns')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="What does this mean?"
                >
                  <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
              {expandedSections.has('request-patterns') && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-semibold mb-1">Request History Patterns:</p>
                  <p>Analyzes your leave request history to identify patterns in duration, frequency, reasons, and preferred months.</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Total Approved</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{requestPatterns.totalApproved}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Avg Duration</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{requestPatterns.avgDuration} days</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Avg Days Between</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{requestPatterns.avgDaysBetween} days</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Most Common Reason</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{requestPatterns.mostCommonReason}</p>
                </div>
              </div>
              {requestPatterns.preferredMonths.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Preferred Months:</p>
                  <div className="flex gap-2">
                    {requestPatterns.preferredMonths.map((month, index) => (
                      <span key={index} className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full text-sm font-medium">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Efficiency Metrics */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Efficiency Metrics</h3>
                <button
                  onClick={() => toggleSection('efficiency-metrics')}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="What does this mean?"
                >
                  <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
              {expandedSections.has('efficiency-metrics') && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-semibold mb-1">Efficiency Metrics:</p>
                  <p>Measures how efficiently you&apos;re using your leave: usage efficiency (used vs available), planning efficiency (advance notice), and balance efficiency (distribution throughout year).</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Usage Efficiency</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{efficiencyMetrics.usageEfficiency}%</p>
                  <div className="mt-2 w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        efficiencyMetrics.usageEfficiency >= 80 ? 'bg-green-600 dark:bg-green-500' :
                        efficiencyMetrics.usageEfficiency >= 50 ? 'bg-yellow-600 dark:bg-yellow-500' :
                        'bg-red-600 dark:bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, efficiencyMetrics.usageEfficiency)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Planning Efficiency</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{efficiencyMetrics.planningEfficiency}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg {efficiencyMetrics.avgAdvanceNotice} days notice</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Balance Efficiency</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{efficiencyMetrics.balanceEfficiency}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Distribution across months</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

