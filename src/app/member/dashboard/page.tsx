'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { MemberAnalytics, getMaternityMemberAnalytics } from '@/lib/analyticsCalculations';
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
  const [team, setTeam] = useState<Team | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<MemberAnalytics | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        setUser(userData); // Set the user state

        // Fetch team data
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!teamResponse.ok) {
          console.error('Failed to fetch team data:', teamResponse.status, teamResponse.statusText);
          const errorData = await teamResponse.json();
          console.error('Error details:', errorData);
          setTeam(null);
        } else {
          const teamData = await teamResponse.json();
          console.log('Team data received:', teamData);
          setTeam(teamData.team);
          
          // Update user with fresh data from server (including shift schedule)
          if (teamData.currentUser) {
            setUser(teamData.currentUser);
          }
        }

        // Fetch my requests
        const requestsResponse = await fetch(`/api/leave-requests?teamId=${userData.teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!requestsResponse.ok) {
          console.error('Failed to fetch requests:', requestsResponse.status, requestsResponse.statusText);
          const errorData = await requestsResponse.json();
          console.error('Error details:', errorData);
          setMyRequests([]);
          return;
        }
        
        const allRequests = await requestsResponse.json();
        console.log('All requests received:', allRequests);
        
        // Ensure allRequests is an array before filtering
        if (Array.isArray(allRequests)) {
          const myRequests = allRequests.filter((req: LeaveRequest) => req.userId === userData.id);
          setMyRequests(myRequests);
        } else {
          console.error('Expected array but got:', typeof allRequests, allRequests);
          setMyRequests([]);
        }

        // Fetch analytics
        const analyticsResponse = await fetch('/api/analytics', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          console.log('Member Dashboard - Analytics data received:', analyticsData);
          console.log('Member Dashboard - Analytics object:', analyticsData.analytics);
          if (analyticsData.analytics) {
            console.log('Member Dashboard - Fields:', {
              usableDays: analyticsData.analytics.usableDays,
              realisticUsableDays: analyticsData.analytics.realisticUsableDays,
              theoreticalWorkingDays: analyticsData.analytics.theoreticalWorkingDays,
              remainingLeaveBalance: analyticsData.analytics.remainingLeaveBalance
            });
          }
          setAnalytics(analyticsData.analytics);
        } else {
          console.error('Analytics API error:', await analyticsResponse.text());
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
      <div className="min-h-screen">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 pt-24 bg-gray-50 dark:bg-black min-h-screen">
          <div className="mb-8 fade-in">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">My Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Welcome back! Here&apos;s your leave information</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                      <ClockIcon className="h-6 w-6 text-yellow-700 dark:text-yellow-400" />
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Pending Requests</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                        {myRequests.filter(req => req.status === 'pending').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    {(() => {
                      // Color icon based on realistic usable days vs remaining balance
                      const realisticUsableDays = analytics?.realisticUsableDays ?? 0;
                      const remainingBalance = leaveBalance.balance;
                      const iconBg = realisticUsableDays >= remainingBalance
                        ? 'bg-green-100 dark:bg-green-900/30' // Good - can use all days
                        : (() => {
                            const realisticPercentage = remainingBalance > 0
                              ? (realisticUsableDays / remainingBalance) * 100
                              : 0;
                            if (realisticPercentage < 30) {
                              return 'bg-red-100 dark:bg-red-900/30'; // Very bad - will lose most days
                            } else if (realisticPercentage < 70) {
                              return 'bg-yellow-100 dark:bg-yellow-900/30'; // Moderate - will lose some days
                            } else {
                              return 'bg-orange-100 dark:bg-orange-900/30'; // Bad - will lose some days
                            }
                          })();
                      const iconColor = realisticUsableDays >= remainingBalance
                        ? 'text-green-700 dark:text-green-400' // Good - can use all days
                        : (() => {
                            const realisticPercentage = remainingBalance > 0
                              ? (realisticUsableDays / remainingBalance) * 100
                              : 0;
                            if (realisticPercentage < 30) {
                              return 'text-red-700 dark:text-red-400'; // Very bad - will lose most days
                            } else if (realisticPercentage < 70) {
                              return 'text-yellow-700 dark:text-yellow-400'; // Moderate - will lose some days
                            } else {
                              return 'text-orange-700 dark:text-orange-400'; // Bad - will lose some days
                            }
                          })();
                      return (
                        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
                          <CalendarIcon className={`h-6 w-6 ${iconColor}`} />
                        </div>
                      );
                    })()}
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Leave Balance</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                        {Math.round(leaveBalance.balance)} / {team?.settings.maxLeavePerYear || 20}
                        <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">(remaining)</span>
                        {leaveBalance.surplus > 0 && (
                          <span className="ml-2 text-sm text-green-600 dark:text-green-400">(+{Math.round(leaveBalance.surplus)} surplus)</span>
                        )}
                      </dd>
                      {user?.manualLeaveBalance !== undefined && Math.round(user.manualLeaveBalance) !== Math.round(leaveBalance.balance) && (
                        <dd className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span className="font-medium">Base balance:</span> {Math.round(user.manualLeaveBalance)} days
                          <span className="ml-2 text-gray-500 dark:text-gray-500">
                            ({Math.round(user.manualLeaveBalance - leaveBalance.balance)} days used)
                          </span>
                        </dd>
                      )}
                      {leaveBalance.surplus > 0 && (
                        <dd className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                            +{Math.round(leaveBalance.surplus)} surplus days
                          </span>
                        </dd>
                      )}
                      {analytics && (() => {
                        const realisticUsableDays = analytics.realisticUsableDays ?? 0;
                        const remainingBalance = leaveBalance.balance;
                        const willLoseDays = realisticUsableDays < remainingBalance ? remainingBalance - realisticUsableDays : 0;
                        if (willLoseDays > 0) {
                              return (
                            <dd className="mt-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                                <ExclamationTriangleIcon className="h-3 w-3" />
                                {Math.round(willLoseDays)} days at risk of being lost
                              </span>
                            </dd>
                          );
                        }
                        return null;
                      })()}
                    </dl>
                    {analytics && (() => {
                      const realisticUsableDays = analytics.realisticUsableDays ?? 0;
                      const remainingBalance = leaveBalance.balance;
                      const maxLeave = team?.settings.maxLeavePerYear || 20;
                      return (
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 mt-3">
                          <div
                            className={`h-2 rounded-full ${
                              realisticUsableDays >= remainingBalance
                                ? 'bg-green-500' // Good - can use all days
                                : (() => {
                                    const realisticPercentage = remainingBalance > 0
                                      ? (realisticUsableDays / remainingBalance) * 100
                                      : 0;
                                    if (realisticPercentage < 30) {
                                      return 'bg-red-600'; // Very bad - will lose most days
                                    } else if (realisticPercentage < 70) {
                                      return 'bg-yellow-500'; // Moderate - will lose some days
                                    } else {
                                      return 'bg-red-500'; // Bad - will lose some days
                                    }
                                  })()
                            }`}
                            style={{
                              width: `${Math.min((remainingBalance / maxLeave) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Working Days Taken This Year</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                        {getTotalWorkingDaysTaken()}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Maternity Leave Card */}
            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center">
                      <CalendarIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Maternity/Paternity Leave</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                        {(() => {
                          const maternityBalance = getMaternityLeaveBalance();
                          const maxMaternityDays = team?.settings.maternityLeave?.maxDays || 90;
                          return (
                            <>
                              {Math.round(maternityBalance.balance)} / {maxMaternityDays}
                              <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">(remaining)</span>
                              {maternityBalance.surplus > 0 && (
                                <span className="ml-2 text-sm text-green-600 dark:text-green-400">(+{Math.round(maternityBalance.surplus)} surplus)</span>
                              )}
                            </>
                          );
                        })()}
                      </dd>
                      {(() => {
                        const maternityBalance = getMaternityLeaveBalance();
                        if (maternityBalance.daysUsed > 0) {
                          return (
                            <dd className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {Math.round(maternityBalance.daysUsed)} days used this year
                            </dd>
                          );
                        }
                        return null;
                      })()}
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section */}
          {analytics && (
            <div className="mb-8 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Year-End Analytics</h2>
              
              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Realistic Usable Days</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{Math.round(analytics.realisticUsableDays ?? 0)}</p>
                      </div>
                      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ChartBarIcon className="h-8 w-8 text-blue-700 dark:text-blue-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Days you can realistically use when shared with {analytics.membersSharingSameShift} member{analytics.membersSharingSameShift !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Usable Days</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{Math.round(analytics.usableDays ?? 0)}</p>
                      </div>
                      <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="h-8 w-8 text-purple-700 dark:text-purple-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Total days available (accounting for concurrent leave limits)
                    </p>
                  </div>
                </div>

                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Theoretical Working Days</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{Math.round(analytics.theoreticalWorkingDays ?? 0)}</p>
                      </div>
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ArrowTrendingUpIcon className="h-8 w-8 text-gray-700 dark:text-gray-300" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Total working days remaining (no constraints)
                    </p>
                  </div>
                </div>

                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Remaining Leave Balance</h3>
                        <div className="mt-2">
                          <div className="flex items-baseline flex-wrap gap-2">
                            <span className="text-3xl font-bold text-gray-900 dark:text-white">
                              {Math.round(analytics.remainingLeaveBalance)} / {team?.settings.maxLeavePerYear || 20}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">(remaining)</span>
                            {analytics.surplusBalance > 0 && (
                              <span className="text-lg text-green-600 dark:text-green-400">
                                (+{Math.round(analytics.surplusBalance)} surplus)
                              </span>
                            )}
                          </div>
                          {analytics.baseLeaveBalance !== undefined && Math.round(analytics.baseLeaveBalance) !== Math.round(analytics.remainingLeaveBalance) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                              <span className="font-medium">Base balance:</span> {Math.round(analytics.baseLeaveBalance)} days
                              <span className="ml-2 text-gray-500 dark:text-gray-500">
                                ({Math.round(analytics.baseLeaveBalance - analytics.remainingLeaveBalance)} days used)
                              </span>
                            </p>
                          )}
                          {analytics.surplusBalance > 0 && (
                            <div className="mt-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                +{Math.round(analytics.surplusBalance)} surplus days
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CalendarIcon className="h-8 w-8 text-green-700 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Leave days available in your account
                    </p>
                  </div>
                </div>
              </div>

              {/* Competition Context Card */}
              <div className="card border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 mb-6">
                <div className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">Competition Context</p>
                      <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                        <strong>{analytics.membersSharingSameShift}</strong> team member{analytics.membersSharingSameShift !== 1 ? 's' : ''} 
                        {' '}with the <strong>same working days pattern</strong> and <strong>shift type</strong> need to coordinate use of 
                        {' '}<strong>{Math.round(analytics.usableDays ?? 0)}</strong> available days.
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-400 mb-1">
                        With {analytics.membersSharingSameShift} members competing for {Math.round(analytics.usableDays ?? 0)} days:
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                        Realistic usable days per member: <strong>{Math.round(analytics.realisticUsableDays ?? 0)}</strong> days 
                        ({Math.round(analytics.averageDaysPerMember)} average)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* High Competition Warning */}
              {analytics.averageDaysPerMember < analytics.remainingLeaveBalance * 0.5 && (
                <div className="card border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 mb-6">
                  <div className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-700 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-red-900 dark:text-red-300 mb-1">High Demand Alert</p>
                        <p className="text-sm text-red-700 dark:text-red-400">
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
                <div className="card border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30 mb-6">
                  <div className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                        <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-orange-900 dark:text-orange-300 mb-1">Concurrent Leave Constraint</p>
                        <p className="text-sm text-orange-700 dark:text-orange-400">
                          Due to concurrent leave limits, you have <strong>{Math.round(analytics.usableDays ?? 0)}</strong> usable days of <strong>{Math.round(analytics.theoreticalWorkingDays)}</strong> remaining working days.
                          {analytics.usableDays < analytics.theoreticalWorkingDays && (
                            <> Some days are already booked by other team members.</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Carryover/Loss Card */}
              <div className={`card card-hover ${analytics.willLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : analytics.willCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-gray-300 dark:border-gray-700'}`}>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Year-End Outlook</h3>
                  
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

          {/* Recent Requests */}
          <div className="card card-hover">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  My Recent Requests
                </h3>
                <a
                  href="/member/requests"
                  className="btn-primary text-sm py-2 px-4"
                >
                  View All →
                </a>
              </div>
              {myRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <DocumentTextIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                    </div>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">No requests yet</p>
                  <a href="/member/requests" className="btn-primary">
                    Create Your First Request
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  {myRequests.slice(0, 5).map((request) => (
                    <div key={request._id} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-gray-500" />
                            {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">{request.reason}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                            Requested on {new Date(request.createdAt).toLocaleDateString()}
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
