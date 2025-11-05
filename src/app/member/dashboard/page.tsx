'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { MemberAnalytics } from '@/lib/analyticsCalculations';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { usePolling } from '@/hooks/usePolling';
import { 
  ClockIcon, 
  CalendarIcon, 
  CheckCircleIcon, 
  ChartBarIcon, 
  ArrowTrendingUpIcon, 
  UsersIcon, 
  ExclamationTriangleIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

export default function MemberDashboard() {
  const { showNotification } = useBrowserNotification();
  const [team, setTeam] = useState<Team | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<MemberAnalytics | null>(null);
  
  // Refs to track notification state and prevent duplicates
  const previousRequestsRef = useRef<LeaveRequest[]>([]);
  const highCompetitionNotifiedRef = useRef(false);
  const losingDaysNotifiedRef = useRef(false);
  const leaveReminderNotifiedRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        setUser(userData); // Set the user state

        // Fetch all dashboard data in a single API call
        const response = await fetch('/api/dashboard', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error('Failed to fetch dashboard data:', response.status, response.statusText);
          const errorData = await response.json();
          console.error('Error details:', errorData);
          setTeam(null);
          setMyRequests([]);
          return;
        }

        const data = await response.json();
        console.log('Dashboard data received:', data);
        
        // Set team and user data
        setTeam(data.team);
        if (data.currentUser) {
          setUser(data.currentUser);
        }
        
        // Filter requests for current user
        if (Array.isArray(data.requests)) {
          const myRequests = data.requests.filter((req: LeaveRequest) => req.userId === userData._id);
          setMyRequests(myRequests);
          // Initialize previous requests ref for polling comparison
          if (previousRequestsRef.current.length === 0) {
            previousRequestsRef.current = myRequests;
          }
          console.log('My requests filtered:', myRequests.length);
        } else {
          console.error('Expected array but got:', typeof data.requests, data.requests);
          setMyRequests([]);
        }

        // Set analytics (structure for members: { analytics: MemberAnalytics })
        if (data.analytics && data.analytics.analytics) {
          console.log('Member Dashboard - Analytics data received:', data.analytics.analytics);
          console.log('Member Dashboard - Fields:', {
            usableDays: data.analytics.analytics.usableDays,
            realisticUsableDays: data.analytics.analytics.realisticUsableDays,
            theoreticalWorkingDays: data.analytics.analytics.theoreticalWorkingDays,
            remainingLeaveBalance: data.analytics.analytics.remainingLeaveBalance
          });
          setAnalytics(data.analytics.analytics);
        } else {
          console.error('No analytics data in response');
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Listen for settings updates to refresh analytics
    const handleSettingsUpdated = () => {
      console.log('[Member Dashboard] Settings updated event received, refetching analytics...');
      // Add a small delay to ensure database write is fully committed before fetching
      setTimeout(() => {
        fetchData();
      }, 200);
    };
    
    window.addEventListener('teamSettingsUpdated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('teamSettingsUpdated', handleSettingsUpdated);
    };
  }, [showNotification]);

  // Polling for request status changes
  usePolling(async () => {
    if (!user) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.requests)) {
          const currentRequests = data.requests.filter((req: LeaveRequest) => req.userId === user._id);
          
          // Check for status changes
          previousRequestsRef.current.forEach((prevRequest) => {
            const currentRequest = currentRequests.find((r: LeaveRequest) => r._id === prevRequest._id);
            if (currentRequest && prevRequest.status === 'pending' && currentRequest.status !== 'pending') {
              const startDate = new Date(currentRequest.startDate).toLocaleDateString();
              const endDate = new Date(currentRequest.endDate).toLocaleDateString();
              
              if (currentRequest.status === 'approved') {
                showNotification(
                  'Leave Request Approved',
                  `Your leave request for ${startDate} to ${endDate} has been approved!`
                );
              } else if (currentRequest.status === 'rejected') {
                showNotification(
                  'Leave Request Rejected',
                  `Your leave request for ${startDate} to ${endDate} has been rejected.`
                );
              }
            }
          });
          
          // Update state if requests changed
          if (currentRequests.length !== myRequests.length || 
              currentRequests.some((req, idx) => req._id !== myRequests[idx]?._id || req.status !== myRequests[idx]?.status)) {
            setMyRequests(currentRequests);
            setTeam(data.team);
            if (data.currentUser) {
              setUser(data.currentUser);
            }
            if (data.analytics && data.analytics.analytics) {
              setAnalytics(data.analytics.analytics);
            }
          }
          
          previousRequestsRef.current = currentRequests;
        }
      }
    } catch (error) {
      console.error('Error polling for request status:', error);
    }
  }, { interval: 30000, enabled: !loading && !!user });

  // Check for high competition warning
  useEffect(() => {
    if (!analytics || highCompetitionNotifiedRef.current) return;
    
    if (analytics.averageDaysPerMember < analytics.remainingLeaveBalance * 0.5) {
      highCompetitionNotifiedRef.current = true;
      showNotification(
        'High Competition Alert',
        `Only ${Math.round(analytics.averageDaysPerMember)} days per member available. Consider coordinating with your team.`
      );
    }
  }, [analytics, showNotification]);

  // Check for losing days warning
  useEffect(() => {
    if (!analytics || losingDaysNotifiedRef.current) return;
    
    if (analytics.willLose > 0) {
      losingDaysNotifiedRef.current = true;
      showNotification(
        'Warning: Days Will Be Lost',
        `You will lose ${Math.round(analytics.willLose)} day(s) at year end if not used. Plan your leave accordingly.`
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
        `You haven't taken leave recently and have ${Math.round(analytics.remainingLeaveBalance)} days remaining. Consider planning your leave.`
      );
      return;
    }
    
    // Find most recent approved request
    const mostRecent = approvedRequests.reduce((latest, req) => {
      const reqDate = new Date(req.endDate);
      const latestDate = new Date(latest.endDate);
      return reqDate > latestDate ? req : latest;
    });
    
    const monthsSinceLastLeave = (Date.now() - new Date(mostRecent.endDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsSinceLastLeave >= 3) {
      leaveReminderNotifiedRef.current = true;
      showNotification(
        'Take Leave Reminder',
        `You haven't taken leave in ${Math.round(monthsSinceLastLeave)} months and have ${Math.round(analytics.remainingLeaveBalance)} days remaining. Consider planning your leave.`
      );
    }
  }, [analytics, myRequests, showNotification]);

  const getLeaveBalance = () => {
    if (!team || !user) {
      console.log('Leave balance calculation: Missing team or user data', { team: !!team, user: !!user });
      return { balance: 0, surplus: 0 };
    }
    
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved')
      .map(req => ({
        startDate: new Date(req.startDate),
        endDate: new Date(req.endDate),
        reason: req.reason
      }));

    console.log('Leave balance calculation:', {
      maxLeavePerYear: team.settings.maxLeavePerYear,
      approvedRequests: approvedRequests.length,
      shiftSchedule: user.shiftSchedule,
      myRequests: myRequests.length
    });

    const balance = calculateLeaveBalance(
      team.settings.maxLeavePerYear,
      approvedRequests,
      user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' },
      user.manualLeaveBalance,
      user.manualYearToDateUsed
    );
    
    const surplus = calculateSurplusBalance(user.manualLeaveBalance, team.settings.maxLeavePerYear);
    
    console.log('Calculated leave balance:', balance, 'Surplus:', surplus);
    return { balance, surplus };
  };

  const getMaternityLeaveBalance = () => {
    if (!team || !user) {
      return { balance: 0, surplus: 0, daysUsed: 0 };
    }
    
    const maxMaternityLeaveDays = team.settings.maternityLeave?.maxDays || 90;
    const countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
    
    const approvedMaternityRequests = myRequests
      .filter(req => req.status === 'approved' && req.reason && isMaternityLeave(req.reason))
      .map(req => ({
        startDate: new Date(req.startDate),
        endDate: new Date(req.endDate),
        reason: req.reason
      }));

    const balance = calculateMaternityLeaveBalance(
      maxMaternityLeaveDays,
      approvedMaternityRequests,
      countingMethod,
      user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' },
      user.manualMaternityLeaveBalance,
      user.manualMaternityYearToDateUsed
    );
    
    const surplus = calculateMaternitySurplusBalance(user.manualMaternityLeaveBalance, maxMaternityLeaveDays);
    
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
        const reqStart = new Date(req.startDate);
        const reqEnd = new Date(req.endDate);
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

  const getTotalWorkingDaysTaken = () => {
    if (!user) return 0;
    
    const currentYear = new Date().getFullYear();
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved' && new Date(req.startDate).getFullYear() === currentYear);

    return approvedRequests.reduce((total, req) => {
      const workingDays = countWorkingDays(
        new Date(req.startDate),
        new Date(req.endDate),
        user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' }
      );
      return total + workingDays;
    }, 0);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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

  const leaveBalance = getLeaveBalance();

  return (
    <ProtectedRoute requiredRole="member">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">My Dashboard</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Welcome back! Here&apos;s your leave information</p>
          </div>

          {/* Stats Cards - Enhanced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
            {/* Pending Requests Card */}
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Pending Requests</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {myRequests.filter(req => req.status === 'pending').length}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Awaiting approval</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                      <ClockIcon className="h-6 w-6 text-yellow-700 dark:text-yellow-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Leave Balance Card */}
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Leave Balance</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(leaveBalance.balance)} / {team?.settings.maxLeavePerYear || 20}
                    </p>
                    <div className="mt-2 space-y-1">
                      {leaveBalance.surplus > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                          +{Math.round(leaveBalance.surplus)} surplus
                        </p>
                      )}
                      {analytics && (() => {
                        const realisticUsableDays = analytics.realisticUsableDays ?? 0;
                        const remainingBalance = leaveBalance.balance;
                        const willLoseDays = realisticUsableDays < remainingBalance ? remainingBalance - realisticUsableDays : 0;
                        if (willLoseDays > 0) {
                          return (
                            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                              {Math.round(willLoseDays)} days at risk
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    {(() => {
                      const realisticUsableDays = analytics?.realisticUsableDays ?? 0;
                      const remainingBalance = leaveBalance.balance;
                      const iconBg = realisticUsableDays >= remainingBalance
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-orange-100 dark:bg-orange-900/30';
                      const iconColor = realisticUsableDays >= remainingBalance
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-orange-700 dark:text-orange-400';
                      return (
                        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
                          <CalendarIcon className={`h-6 w-6 ${iconColor}`} />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Working Days Taken Card */}
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Days Taken</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {getTotalWorkingDaysTaken()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This year</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Maternity Leave Card */}
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Maternity/Paternity</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {(() => {
                        const maternityBalance = getMaternityLeaveBalance();
                        const maxMaternityDays = team?.settings.maternityLeave?.maxDays || 90;
                        return `${Math.round(maternityBalance.balance)} / ${maxMaternityDays}`;
                      })()}
                    </p>
                    <div className="mt-2 space-y-1">
                      {(() => {
                        const maternityBalance = getMaternityLeaveBalance();
                        if (maternityBalance.daysUsed > 0) {
                          return (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {Math.round(maternityBalance.daysUsed)} used
                            </p>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const maternityBalance = getMaternityLeaveBalance();
                        if (maternityBalance.surplus > 0) {
                          return (
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                              +{Math.round(maternityBalance.surplus)} surplus
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center">
                      <CalendarIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section - Enhanced */}
          {analytics && (
            <div className="mb-8 space-y-8 fade-in">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3">Year-End Analytics</h2>
                <p className="text-base text-gray-500 dark:text-gray-400">Your leave performance and outlook</p>
              </div>
              
              {/* Analytics Cards - Enhanced */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
                <div className="stat-card group">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Realistic Usable</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                          {Math.round(analytics.realisticUsableDays ?? 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">With constraints</p>
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
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Usable Days</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                          {Math.round(analytics.usableDays ?? 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">Available</p>
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
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Theoretical Days</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-700 dark:text-gray-300 mb-1 fade-in">
                          {Math.round(analytics.theoreticalWorkingDays ?? 0)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">Without constraints</p>
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
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Remaining Balance</p>
                        <div className="mb-2">
                          <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                            {Math.round(analytics.remainingLeaveBalance)} / {team?.settings.maxLeavePerYear || 20}
                          </p>
                          {analytics.surplusBalance > 0 && (
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                              +{Math.round(analytics.surplusBalance)} surplus
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                          <CalendarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Competition Context Card - Enhanced */}
              <div className="card border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30">
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
              <div className={`card ${analytics.willLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : analytics.willCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-gray-300 dark:border-gray-700'}`}>
                <div className="p-5 sm:p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Year-End Outlook</h3>
                  
                  {analytics.allowCarryover ? (
                    <div>
                      {analytics.willCarryover > 0 ? (
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                            <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{Math.round(analytics.willCarryover)} days</p>
                            <p className="text-sm text-green-600 dark:text-green-400">will carry over to next year</p>
                          </div>
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
                      <span>Leave Usage</span>
                      <span>{analytics.workingDaysUsed} / {analytics.workingDaysInYear} working days</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (analytics.workingDaysUsed / analytics.workingDaysInYear) * 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {Math.round((analytics.workingDaysUsed / analytics.workingDaysInYear) * 100)}% of working days used this year
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Requests - Enhanced */}
          <div className="card">
            <div className="p-5 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    My Recent Requests
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {myRequests.length} total request{myRequests.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <a
                  href="/member/requests"
                  className="btn-primary text-sm py-2 px-4"
                >
                  View All →
                </a>
              </div>
              {myRequests.length === 0 ? (
                <div className="text-center py-12 fade-in">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <DocumentTextIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 text-lg font-semibold mb-1">No requests yet</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Create your first leave request to get started</p>
                  <a href="/member/requests" className="btn-primary">
                    Create Your First Request
                  </a>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin">
                  {myRequests.slice(0, 5).map((request, index) => (
                    <div 
                      key={request._id} 
                      className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800/50 rounded-xl p-4 sm:p-5 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 stagger-item"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
