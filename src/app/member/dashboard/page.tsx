'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { getEffectiveManualYearToDateUsed } from '@/lib/yearOverrides';
import { MemberAnalytics } from '@/lib/analyticsCalculations';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { calculateTimeBasedLeaveScore, getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { parseDateSafe } from '@/lib/dateUtils';
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
          // Handle 401 (Unauthorized) - token expired or invalid
          if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return;
          }
          
          console.error('Failed to fetch dashboard data:', response.status, response.statusText);
          const errorData = await response.json();
          console.error('Error details:', errorData);
          setTeam(null);
          setMyRequests([]);
          return;
        }

        const data = await response.json();
        
        // Set team and user data
        setTeam(data.team);
        if (data.currentUser) {
          setUser(data.currentUser);
        }
        
        // Filter requests for current user
        // Use ObjectId comparison to handle both string and ObjectId formats
        // Prefer currentUser._id from API response as it's more reliable
        if (Array.isArray(data.requests)) {
          const userIdToMatch = data.currentUser?._id || userData._id;
          if (!userIdToMatch) {
            console.error('[Member Dashboard] No user ID found for filtering requests');
            setMyRequests([]);
          } else {
            const myRequests = data.requests.filter((req: LeaveRequest) => {
              const reqUserId = String(req.userId).trim();
              const currentUserId = String(userIdToMatch).trim();
              return reqUserId === currentUserId;
            });
            setMyRequests(myRequests);
            // Initialize previous requests ref for polling comparison
            if (previousRequestsRef.current.length === 0) {
              previousRequestsRef.current = myRequests;
            }
          }
        } else {
          console.error('[Member Dashboard] Expected array but got:', typeof data.requests, data.requests);
          setMyRequests([]);
        }

        // Set analytics (structure for members: { analytics: MemberAnalytics })
        if (data.analytics && data.analytics.analytics) {
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

  // Real-time updates using SSE with fallback to polling
  const refetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(userData);

      const response = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Handle 401 (Unauthorized) - token expired or invalid
        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }
        
        console.error('Failed to fetch dashboard data:', response.status, response.statusText);
        return;
      }

      const data = await response.json();
      
      setTeam(data.team);
      if (data.currentUser) {
        setUser(data.currentUser);
      }
      
      if (Array.isArray(data.requests)) {
        const userIdToMatch = data.currentUser?._id || userData._id;
        if (!userIdToMatch) {
          setMyRequests([]);
        } else {
          const myRequests = data.requests.filter((req: LeaveRequest) => {
            const reqUserId = String(req.userId).trim();
            const currentUserId = String(userIdToMatch).trim();
            return reqUserId === currentUserId;
          });
          setMyRequests(myRequests);
          previousRequestsRef.current = myRequests;
        }
      }
      
      if (data.analytics && data.analytics.analytics) {
        setAnalytics(data.analytics.analytics);
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
        const token = localStorage.getItem('token');
        const response = await fetch('/api/dashboard', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.requests)) {
            const userIdToMatch = data.currentUser?._id || user._id;
            const currentRequests = userIdToMatch ? data.requests.filter((req: LeaveRequest) => {
              const reqUserId = String(req.userId).trim();
              const currentUserId = String(userIdToMatch).trim();
              return reqUserId === currentUserId;
            }) : [];
            
            // Check for status changes
            previousRequestsRef.current.forEach((prevRequest) => {
              const currentRequest = currentRequests.find((r: LeaveRequest) => r._id === prevRequest._id);
              if (currentRequest && prevRequest.status === 'pending' && currentRequest.status !== 'pending') {
                const startDate = parseDateSafe(currentRequest.startDate).toLocaleDateString();
                const endDate = parseDateSafe(currentRequest.endDate).toLocaleDateString();
                
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
                currentRequests.some((req: LeaveRequest, idx: number) => req._id !== myRequests[idx]?._id || req.status !== myRequests[idx]?.status)) {
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
        const data = event.data as { requestId: string; userId: string; newStatus: string };
        if (user && String(data.userId).trim() === String(user._id).trim()) {
          // Update request status
          refetchData();
          
          // Show notification for status changes
          if (data.newStatus === 'approved') {
            showNotification(
              'Leave Request Approved',
              'Your leave request has been approved!'
            );
          } else if (data.newStatus === 'rejected') {
            showNotification(
              'Leave Request Rejected',
              'Your leave request has been rejected.'
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
        `Only ${Math.round(analytics.averageDaysPerMember)} days per member available. Consider coordinating with your team.`
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
        message
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
        message
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
      const reqDate = parseDateSafe(req.endDate);
      const latestDate = parseDateSafe(latest.endDate);
      return reqDate > latestDate ? req : latest;
    });
    
    const monthsSinceLastLeave = (Date.now() - parseDateSafe(mostRecent.endDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    
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

  const getTotalWorkingDaysTaken = () => {
    // Use analytics data if available (includes manualYearToDateUsed handling)
    if (analytics && analytics.workingDaysUsed !== undefined) {
      return analytics.workingDaysUsed;
    }
    
    // Fallback to local calculation if analytics not yet loaded
    if (!user) return 0;
    
    const currentYear = new Date().getFullYear();
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved' && parseDateSafe(req.startDate).getFullYear() === currentYear);

    return approvedRequests.reduce((total, req) => {
      const workingDays = countWorkingDays(
        parseDateSafe(req.startDate),
        parseDateSafe(req.endDate),
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
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">My Dashboard</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Welcome back! Here&apos;s your leave information</p>
          </div>

          {/* Stats Cards - Enhanced */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${team?.settings.allowCarryover ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-6 sm:gap-8 mb-8`}>
            {/* Pending Requests Card */}
            <Link href="/member/requests" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Pending Requests</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Array.isArray(myRequests) ? myRequests.filter(req => req.status === 'pending').length : 0}
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
            </Link>

            {/* Leave Balance Card */}
            {(() => {
              const isNegative = analytics && annualRemainingBalance < 0;
              const maternityBalance = getMaternityLeaveBalance();
              const hasCompassionateLeave = isNegative && (
                maternityBalance.daysUsed > 0 || 
                myRequests.some(req => 
                  req.status === 'approved' && 
                  req.reason && 
                  (isMaternityLeave(req.reason) || 
                   req.reason.toLowerCase().includes('sick') ||
                   req.reason.toLowerCase().includes('bereavement') ||
                   req.reason.toLowerCase().includes('medical') ||
                   req.reason.toLowerCase().includes('family emergency') ||
                   req.reason.toLowerCase().includes('emergency'))
                )
              );
              
              return (
                <Link href="/member/analytics" className={`stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 ${isNegative ? (hasCompassionateLeave ? 'border-2 border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/30' : 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30') : ''}`}>
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Leave Balance</p>
                    <p className={`text-3xl sm:text-4xl font-bold mb-1 fade-in ${
                      analytics && annualRemainingBalance < 0 
                        ? (hasCompassionateLeave 
                            ? 'text-pink-600 dark:text-pink-400' 
                            : 'text-red-600 dark:text-red-400')
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {analytics && annualRemainingBalance < 0 ? (
                        <>-{Math.round(Math.abs(annualRemainingBalance))} / {team?.settings.maxLeavePerYear || 20}</>
                      ) : (
                        <>{Math.round(annualRemainingBalance)} / {team?.settings.maxLeavePerYear || 20}</>
                      )}
                    </p>
                    <div className="mt-2 space-y-1">
                      {analytics && annualRemainingBalance < 0 && (() => {
                        const maternityBalance = getMaternityLeaveBalance();
                        const hasTakenMaternityLeave = maternityBalance.daysUsed > 0;
                        
                        // Check for other compassionate leave reasons
                        const compassionateRequests = myRequests.filter(req => 
                          req.status === 'approved' && 
                          req.reason && 
                          (isMaternityLeave(req.reason) || 
                           req.reason.toLowerCase().includes('sick') ||
                           req.reason.toLowerCase().includes('bereavement') ||
                           req.reason.toLowerCase().includes('medical') ||
                           req.reason.toLowerCase().includes('family emergency') ||
                           req.reason.toLowerCase().includes('emergency'))
                        );
                        const hasCompassionateLeave = hasTakenMaternityLeave || compassionateRequests.length > 0;
                        
                        // Determine compassionate reason for message
                        let compassionateNote = '';
                        if (hasCompassionateLeave) {
                          if (hasTakenMaternityLeave) {
                            compassionateNote = ' - maternity/paternity leave noted, will be adjusted next year';
                          } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('sick'))) {
                            compassionateNote = ' - sick leave noted, will be adjusted next year';
                          } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('bereavement'))) {
                            compassionateNote = ' - bereavement leave noted, will be adjusted next year';
                          } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('medical'))) {
                            compassionateNote = ' - medical leave noted, will be adjusted next year';
                          } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('emergency'))) {
                            compassionateNote = ' - emergency leave noted, will be adjusted next year';
                          } else {
                            compassionateNote = ' - necessary leave noted, will be adjusted next year';
                          }
                        } else {
                          compassionateNote = ' - will be adjusted in next year\'s allocation';
                        }
                        
                        const iconColor = hasCompassionateLeave 
                          ? 'text-pink-600 dark:text-pink-400'
                          : 'text-red-600 dark:text-red-400';
                        const textColor = hasCompassionateLeave 
                          ? 'text-pink-700 dark:text-pink-400'
                          : 'text-red-700 dark:text-red-400';
                        
                        return (
                          <div className="flex items-start gap-1.5">
                            <ExclamationTriangleIcon className={`h-4 w-4 ${iconColor} flex-shrink-0 mt-0.5`} />
                            <p className={`text-xs ${textColor} font-medium`}>
                              {Math.round(Math.abs(analytics.remainingLeaveBalance))} day{Math.abs(analytics.remainingLeaveBalance) !== 1 ? 's' : ''} over allocated
                              {compassionateNote}
                            </p>
                          </div>
                        );
                      })()}
                      {leaveBalance.surplus > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                          +{Math.round(leaveBalance.surplus)} surplus
                        </p>
                      )}
                      {analytics && analytics.remainingLeaveBalance >= 0 && (() => {
                        const realisticUsableDays = analytics.realisticUsableDays ?? 0;
                        const remainingBalance = analytics.remainingLeaveBalance ?? leaveBalance.balance;
                        const willLoseDays = analytics.willLose ?? (realisticUsableDays < remainingBalance ? remainingBalance - realisticUsableDays : 0);
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
                      const remainingBalance = analytics?.remainingLeaveBalance ?? leaveBalance.balance;
                      const isNegative = analytics && annualRemainingBalance < 0;
                      
                      // Check for compassionate leave if negative
                      let hasCompassionateLeave = false;
                      if (isNegative) {
                        const maternityBalance = getMaternityLeaveBalance();
                        hasCompassionateLeave = maternityBalance.daysUsed > 0 || 
                          myRequests.some(req => 
                            req.status === 'approved' && 
                            req.reason && 
                            (isMaternityLeave(req.reason) || 
                             req.reason.toLowerCase().includes('sick') ||
                             req.reason.toLowerCase().includes('bereavement') ||
                             req.reason.toLowerCase().includes('medical') ||
                             req.reason.toLowerCase().includes('family emergency') ||
                             req.reason.toLowerCase().includes('emergency'))
                          );
                      }
                      
                      const iconBg = isNegative
                        ? (hasCompassionateLeave 
                            ? 'bg-pink-100 dark:bg-pink-900/30'
                            : 'bg-red-100 dark:bg-red-900/30')
                        : realisticUsableDays >= remainingBalance
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-orange-100 dark:bg-orange-900/30';
                      const iconColor = isNegative
                        ? (hasCompassionateLeave 
                            ? 'text-pink-700 dark:text-pink-400'
                            : 'text-red-700 dark:text-red-400')
                        : realisticUsableDays >= remainingBalance
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-orange-700 dark:text-orange-400';
                      return (
                        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
                          {isNegative ? (
                            <ExclamationTriangleIcon className={`h-6 w-6 ${iconColor}`} />
                          ) : (
                            <CalendarIcon className={`h-6 w-6 ${iconColor}`} />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </Link>
              );
            })()}

            {/* Carryover Balance Card */}
            {team?.settings.allowCarryover && (
              <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Carryover Balance</p>
                      <p className={`text-3xl sm:text-4xl font-bold mb-1 fade-in ${
                        analytics?.carryoverBalance && analytics.carryoverBalance > 0
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {analytics?.carryoverBalance
                          ? `${Math.round(analytics.carryoverBalance)}/${Math.round(user?.carryoverFromPreviousYear ?? analytics.carryoverBalance)}`
                          : 0}
                      </p>
                      <div className="mt-2 space-y-1">
                        {analytics?.carryoverBalance && analytics.carryoverBalance > 0 ? (
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                            available from previous year
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-500">No carryover available</p>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        analytics?.carryoverBalance && analytics.carryoverBalance > 0
                          ? (() => {
                              const expiryDate = analytics.carryoverExpiryDate ? new Date(analytics.carryoverExpiryDate) : null;
                              const today = new Date();
                              const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                              const isExpiringSoon = expiryDate && daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                              const isExpired = expiryDate && daysUntilExpiry !== null && daysUntilExpiry <= 0;
                              
                              if (isExpired) {
                                return 'bg-red-100 dark:bg-red-900/30';
                              } else if (isExpiringSoon) {
                                return 'bg-orange-100 dark:bg-orange-900/30';
                              } else {
                                return 'bg-indigo-100 dark:bg-indigo-900/30';
                              }
                            })()
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <ArrowTrendingUpIcon className={`h-6 w-6 ${
                          analytics?.carryoverBalance && analytics.carryoverBalance > 0
                            ? (() => {
                                const expiryDate = analytics.carryoverExpiryDate ? new Date(analytics.carryoverExpiryDate) : null;
                                const today = new Date();
                                const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                                const isExpiringSoon = expiryDate && daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                                const isExpired = expiryDate && daysUntilExpiry !== null && daysUntilExpiry <= 0;
                                
                                if (isExpired) {
                                  return 'text-red-700 dark:text-red-400';
                                } else if (isExpiringSoon) {
                                  return 'text-orange-700 dark:text-orange-400';
                                } else {
                                  return 'text-indigo-700 dark:text-indigo-400';
                                }
                              })()
                            : 'text-gray-700 dark:text-gray-300'
                        }`} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Working Days Taken Card */}
            <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Days Taken</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {analytics?.workingDaysUsed !== undefined ? Math.round(analytics.workingDaysUsed) : getTotalWorkingDaysTaken()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">This year</p>
                    {user && getEffectiveManualYearToDateUsed(user) !== undefined && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Manual override</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Maternity Leave Card */}
            {(() => {
              const userType = user?.maternityPaternityType;
              const hasTypeAssigned = !!userType;
              const isTypeEnabled = userType === 'paternity' 
                ? team?.settings.paternityLeave?.enabled 
                : userType === 'maternity' 
                  ? team?.settings.maternityLeave?.enabled 
                  : false;
              
              // Show card if type is assigned and enabled, or show "Not available" message
              if (!hasTypeAssigned) {
                return (
                  <div className="stat-card group opacity-60">
                    <div className="p-5 sm:p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                            Maternity/Paternity Leave
                          </p>
                          <p className="text-lg font-medium text-gray-400 dark:text-gray-500 italic mb-1">
                            Not allocated
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                            You have not been assigned maternity or paternity leave
                          </p>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                            <CalendarIcon className="h-6 w-6 text-gray-400 dark:text-gray-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              
              if (!isTypeEnabled) {
                return (
                  <div className="stat-card group opacity-60">
                    <div className="p-5 sm:p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                            {userType === 'maternity' ? '🤱 Maternity Leave' : '👨‍👩‍👧 Paternity Leave'}
                          </p>
                          <p className="text-lg font-medium text-gray-400 dark:text-gray-500 italic mb-1">
                            Not available
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                            {userType === 'maternity' ? 'Maternity' : 'Paternity'} leave is not enabled for your team
                          </p>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                            <CalendarIcon className="h-6 w-6 text-gray-400 dark:text-gray-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Type is assigned and enabled - show normal card
              return (
                <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                          {userType === 'maternity' ? '🤱 Maternity Leave' : '👨‍👩‍👧 Paternity Leave'}
                        </p>
                        <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                          {(() => {
                            const maternityBalance = getMaternityLeaveBalance();
                            const maxDays = userType === 'paternity' 
                              ? (team?.settings.paternityLeave?.maxDays || 90)
                              : (team?.settings.maternityLeave?.maxDays || 90);
                            
                            // Show "Not available" if balance is 0/90 and no type assigned (shouldn't happen here, but safety check)
                            if (maternityBalance.balance === 0 && maxDays === 90 && !user.manualMaternityLeaveBalance) {
                              return 'Not available';
                            }
                            
                            return `${Math.round(maternityBalance.balance)} / ${maxDays}`;
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
            </Link>
              );
            })()}
          </div>

          {/* Member Score Card - Hero Style */}
          {(() => {
            // Use analytics if available, otherwise use fallback values
            const baseBalance = analytics?.baseLeaveBalance ?? (team?.settings.maxLeavePerYear || 20);
            const used = baseBalance - (analytics?.remainingLeaveBalance ?? 0);
            const usagePercentage = baseBalance > 0 ? (used / baseBalance) * 100 : 0;
            const realisticUsableDays = analytics?.realisticUsableDays ?? 0;
            const remainingBalance = analytics?.remainingLeaveBalance ?? 0;
            const willLoseDays = analytics?.willLose ?? 0;
            const willCarryoverDays = analytics?.willCarryover ?? 0;
            const carryoverLimitedToMonths = analytics?.carryoverLimitedToMonths;
            const carryoverMaxDays = analytics?.carryoverMaxDays;
            const carryoverExpiryDate = analytics?.carryoverExpiryDate;
            const isNegativeBalance = remainingBalance < 0;
            const negativeBalanceAmount = isNegativeBalance ? Math.abs(remainingBalance) : 0;
            
            // Determine score and status - Negative balance takes highest priority
            let score = 'excellent';
            let gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
            let bgGradient = 'bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-900/50 dark:to-emerald-900/50';
            let borderColor = 'border-green-500 dark:border-green-500';
            let textColor = 'text-green-700 dark:text-green-300';
            let badgeColor = 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-white';
            let quote = '';
            let message = '';
            let scoreLabel = 'Excellent';
            
            // If no analytics, show loading state
            if (!analytics) {
              gradientColors = 'from-gray-500 via-gray-500 to-gray-500';
              bgGradient = 'bg-gradient-to-br from-gray-200 to-gray-200 dark:from-gray-900/50 dark:to-gray-900/50';
              borderColor = 'border-gray-500 dark:border-gray-500';
              textColor = 'text-gray-700 dark:text-gray-300';
              badgeColor = 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white';
              quote = 'Loading your leave health score...';
              message = 'Please wait while we calculate your leave analytics.';
              scoreLabel = 'Loading...';
            }
            // Handle negative balance first (over-allocation)
            else if (isNegativeBalance) {
              // Check if user has taken compassionate leave this year (maternity, sick, bereavement, medical, etc.)
              const maternityBalance = getMaternityLeaveBalance();
              const hasTakenMaternityLeave = maternityBalance.daysUsed > 0;
              
              // Check for other compassionate leave reasons
              const compassionateRequests = myRequests.filter(req => 
                req.status === 'approved' && 
                req.reason && 
                (isMaternityLeave(req.reason) || 
                 req.reason.toLowerCase().includes('sick') ||
                 req.reason.toLowerCase().includes('bereavement') ||
                 req.reason.toLowerCase().includes('medical') ||
                 req.reason.toLowerCase().includes('family emergency') ||
                 req.reason.toLowerCase().includes('emergency'))
              );
              const hasCompassionateLeave = hasTakenMaternityLeave || compassionateRequests.length > 0;
              
              if (hasCompassionateLeave) {
                // Softer colors (maternity/pink tones) for compassionate leave
                score = 'critical';
                gradientColors = 'from-pink-500 via-rose-500 to-pink-600';
                bgGradient = 'bg-gradient-to-br from-pink-200 to-rose-200 dark:from-pink-900/50 dark:to-rose-900/50';
                borderColor = 'border-pink-500 dark:border-pink-500';
                textColor = 'text-pink-800 dark:text-pink-200';
                badgeColor = 'bg-pink-200 dark:bg-pink-900 text-pink-900 dark:text-white';
                
                // Determine specific compassionate reason for message
                let compassionateReason = '';
                if (hasTakenMaternityLeave) {
                  compassionateReason = 'maternity/paternity leave';
                } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('sick'))) {
                  compassionateReason = 'sick leave';
                } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('bereavement'))) {
                  compassionateReason = 'bereavement leave';
                } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('medical'))) {
                  compassionateReason = 'medical leave';
                } else if (compassionateRequests.some(r => r.reason?.toLowerCase().includes('emergency'))) {
                  compassionateReason = 'emergency leave';
                } else {
                  compassionateReason = 'necessary leave';
                }
                
                quote = 'Taking necessary leave is important.';
                message = `You've used ${Math.round(negativeBalanceAmount)} more day${negativeBalanceAmount !== 1 ? 's' : ''} than your allocated regular leave this year. We understand that ${compassionateReason} is necessary and important. This will be adjusted in your next year's allocation. Please coordinate with your team leader to discuss how this will be handled.`;
                scoreLabel = 'Over Allocated';
              } else {
                // Harsh red colors only when it's regular leave over-allocation
                score = 'critical';
                gradientColors = 'from-red-700 via-rose-700 to-pink-700';
                bgGradient = 'bg-gradient-to-br from-red-200 to-rose-200 dark:from-red-900/50 dark:to-rose-900/50';
                borderColor = 'border-red-500 dark:border-red-500';
                textColor = 'text-red-800 dark:text-red-200';
                badgeColor = 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-white';
                
                quote = 'Taking time off when needed is important.';
                message = `You've used ${Math.round(negativeBalanceAmount)} more day${negativeBalanceAmount !== 1 ? 's' : ''} than your allocated leave this year. This is understandable - sometimes leave is needed beyond what's allocated. This will be adjusted in your next year's leave allocation. Please coordinate with your team leader to discuss how this will be handled.`;
                scoreLabel = 'Over Allocated';
              }
            } else if (analytics) {
              // Use time-based scoring that accounts for time of year and usage patterns
              // Check if manual leave balance is set
              const hasManualBalance = user?.manualLeaveBalance !== undefined || (user ? getEffectiveManualYearToDateUsed(user) !== undefined : false);
              const timeBasedScore = calculateTimeBasedLeaveScore(
                baseBalance,
                used,
                remainingBalance,
                realisticUsableDays,
                willLoseDays,
                willCarryoverDays,
                hasManualBalance,
                carryoverLimitedToMonths,
                carryoverMaxDays,
                carryoverExpiryDate
              );
              
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              score = timeBasedScore.score;
              gradientColors = timeBasedScore.gradientColors;
              bgGradient = timeBasedScore.bgGradient;
              borderColor = timeBasedScore.borderColor;
              textColor = timeBasedScore.textColor;
              badgeColor = timeBasedScore.badgeColor;
              quote = timeBasedScore.quote;
              message = timeBasedScore.message;
              scoreLabel = timeBasedScore.scoreLabel;
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
                        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradientColors} flex items-center justify-center shadow-lg relative overflow-hidden`}>
                          {/* Dark overlay for better icon contrast */}
                          <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
                          <CheckCircleIcon className="h-10 w-10 text-white relative z-10 drop-shadow-lg" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Leave Health Score</p>
                          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{scoreLabel}</h2>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${badgeColor} shadow-md`}>
                        {!analytics 
                          ? 'Loading...'
                          : isNegativeBalance 
                            ? `${Math.round(negativeBalanceAmount)} days over limit`
                            : `${Math.round(realisticUsableDays)} / ${Math.round(remainingBalance)} days usable`
                        }
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
                      {analytics && (
                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {Math.round(usagePercentage)}% leave used
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {Math.round(remainingBalance)} days remaining
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Analytics Section - Enhanced */}
          <div className="mb-8 space-y-8 fade-in">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3">Year-End Analytics</h2>
              <p className="text-base text-gray-500 dark:text-gray-400">Your leave performance and outlook</p>
            </div>
            
            {analytics ? (
              <>
              
              {/* Analytics Cards - Enhanced */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
                <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Realistic Days</p>
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
                </Link>

                <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Available Days</p>
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
                </Link>

                <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
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
                </Link>

                <Link href="/member/analytics" className="stat-card group cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Team Competition</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                          {analytics.membersSharingSameShift ?? 0}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">Same shift members</p>
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
                </Link>

              </div>

              {/* Competition Context Card - Enhanced */}
              <div className="card border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30">
                <div className="p-5">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-indigo-900 dark:text-indigo-300">Competition Context</p>
                        {analytics.hasPartialCompetition && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            analytics.partialOverlapMembersWithBalance > 0
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-700'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}>
                            {analytics.partialOverlapMembersWithBalance > 0 ? '⚠️' : 'ℹ️'} {analytics.partialOverlapMembersCount} partial overlap
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-2 leading-relaxed">
                        <strong>{analytics.membersSharingSameShift}</strong> team member{analytics.membersSharingSameShift !== 1 ? 's' : ''} 
                        {' '}with the <strong>same working days pattern</strong>{(() => {
                          if (!user || !user.shiftSchedule) return '';
                          const workingDaysTag = user.shiftSchedule.type === 'rotating'
                            ? generateWorkingDaysTag(user.shiftSchedule)
                            : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule));
                          const groupName = getWorkingDaysGroupDisplayName(workingDaysTag, team?.settings);
                          return ` (${groupName})`;
                        })()} and <strong>shift type</strong> need to coordinate use of 
                        {' '}<strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days.
                      </p>
                      {analytics.hasPartialCompetition && analytics.partialOverlapMembersWithBalance > 0 && (
                        <p className="text-sm text-orange-700 dark:text-orange-400 mb-2 leading-relaxed font-medium">
                          ⚠️ <strong>{analytics.partialOverlapMembersWithBalance}</strong> member{analytics.partialOverlapMembersWithBalance !== 1 ? 's' : ''} with <strong>different shift patterns</strong> but <strong>overlapping working days</strong> {analytics.partialOverlapMembersWithBalance > 1 ? 'have' : 'has'} leave balances and may compete for the same dates.
                        </p>
                      )}
                      {analytics.hasPartialCompetition && analytics.partialOverlapMembersWithBalance === 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                          ℹ️ {analytics.partialOverlapMembersCount} member{analytics.partialOverlapMembersCount !== 1 ? 's' : ''} with different shift patterns but overlapping working days (no active leave balances).
                        </p>
                      )}
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
                            Due to concurrent leave limits, you have <strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days of <strong>{Math.round(analytics.theoreticalWorkingDays)}</strong> remaining working days.
                            Some days are already booked by other team members.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Year-End Outlook Card - Enhanced */}
              <Link href="/member/analytics" className="block">
                <div className={`card ${analytics.willLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : analytics.willCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-gray-300 dark:border-gray-700'} hover:shadow-lg transition-shadow cursor-pointer`}>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">Year-End Outlook</h3>
                      <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  
                  {analytics.allowCarryover ? (
                    <div>
                      {/* Current Carryover from Last Year */}
                      {analytics.carryoverBalance > 0 && (
                        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                              <CalendarIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{Math.round(analytics.carryoverBalance)} days</p>
                              <p className="text-sm text-blue-600 dark:text-blue-400">available from last year</p>
                            </div>
                          </div>
                          {analytics.carryoverExpiryDate && (
                            <div className="ml-16 mt-2">
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                {(() => {
                                  const expiryDate = new Date(analytics.carryoverExpiryDate);
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  expiryDate.setHours(0, 0, 0, 0);
                                  
                                  if (expiryDate < today) {
                                    return `Expired on ${expiryDate.toLocaleDateString()}`;
                                  } else {
                                    return `Expires on ${expiryDate.toLocaleDateString()}`;
                                  }
                                })()}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Future Carryover - Will Carry Over to Next Year */}
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
                      {analytics.willCarryover > 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                        Your team allows leave carryover. Unused days will be available next year.
                      </p>
                      ) : analytics.allowCarryover ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                          Your team allows leave carryover, but you don&apos;t have any days that will carry over.
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                          Your team does not allow leave carryover. Unused days will be lost at year end.
                        </p>
                      )}
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
              </Link>
            </>
            ) : (
              <div className="card">
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading analytics data...</p>
                </div>
              </div>
            )}
          </div>

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
                                {parseDateSafe(request.startDate).toLocaleDateString()} - {parseDateSafe(request.endDate).toLocaleDateString()}
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
