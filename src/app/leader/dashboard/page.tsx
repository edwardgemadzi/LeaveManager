'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, calculateSurplusBalance, calculateMaternityLeaveBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { 
  UsersIcon, 
  ClockIcon, 
  ChartBarIcon, 
  DocumentIcon, 
  UserIcon, 
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

export default function LeaderDashboard() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);

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
      setPendingRequests((data.requests || []).filter((req: LeaveRequest) => req.status === 'pending'));
      
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
  }, []);

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
      <div className="min-h-screen">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 pt-24 bg-gray-50 dark:bg-black min-h-screen">
          <div className="mb-8 fade-in">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Leader Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Welcome back! Here&apos;s what&apos;s happening with your team</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Team Members</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">{members?.filter(m => m.role === 'member').length || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

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
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">{pendingRequests?.length || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                      <ChartBarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Avg Leave Balance</dt>
                      <dd className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(getLeaveBalanceSummary().averageRemaining)}</dd>
                      <dd className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {getLeaveBalanceSummary().membersWithLowBalance} member(s) with low balance
                      </dd>
                      {getLeaveBalanceSummary().totalSurplus > 0 && (
                        <dd className="text-xs text-green-600 dark:text-green-400 mt-1">
                          +{Math.round(getLeaveBalanceSummary().totalSurplus)} total surplus ({getLeaveBalanceSummary().membersWithSurplus} member(s))
                        </dd>
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Maternity Leave Summary Card */}
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
                        {Math.round(getMaternityLeaveSummary().averageRemaining)}
                      </dd>
                      <dd className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {Math.round(getMaternityLeaveSummary().totalUsed)} days used this year
                      </dd>
                      <dd className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {getMaternityLeaveSummary().totalRemaining} total remaining
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Pending Requests */}
          <div className="card card-hover mb-8">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Recent Pending Requests
              </h3>
              {!pendingRequests || pendingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <DocumentIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                    </div>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-lg">No pending requests at the moment</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">All requests have been processed</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {pendingRequests.map((request) => {
                    const member = members?.find(m => m._id === request.userId);
                    return (
                      <div key={request._id} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                              <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                              {member?.username || 'Unknown User'}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-gray-500" />
                              {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{request.reason}</p>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <button 
                              onClick={() => handleApprove(request._id!)}
                              disabled={processingRequest === request._id}
                              className="btn-success text-xs py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {processingRequest === request._id ? (
                                <ClockIcon className="h-4 w-4" />
                              ) : (
                                <CheckCircleIcon className="h-4 w-4" />
                              )}
                              {processingRequest === request._id ? 'Processing...' : 'Approve'}
                            </button>
                            <button 
                              onClick={() => handleReject(request._id!)}
                              disabled={processingRequest === request._id}
                              className="btn-danger text-xs py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {processingRequest === request._id ? (
                                <ClockIcon className="h-4 w-4" />
                              ) : (
                                <XCircleIcon className="h-4 w-4" />
                              )}
                              {processingRequest === request._id ? 'Processing...' : 'Reject'}
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

          {/* Analytics Section */}
              {analytics && (
            <div className="mb-8 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Year-End Analytics</h2>
              
              {/* Aggregate Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Realistic Usable Days</h3>
                        <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">{Math.round(analytics.aggregate.totalRealisticUsableDays ?? 0)}</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ChartBarIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">With concurrent leave constraints</p>
                  </div>
                </div>

                <div className="card card-hover">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Theoretical Working Days</h3>
                        <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-1">{Math.round(analytics.aggregate.totalTheoreticalWorkingDays ?? 0)}</p>
                      </div>
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ArrowTrendingUpIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total without constraints</p>
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

                <div className={`card card-hover ${analytics.aggregate.totalWillCarryover > 0 ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : ''}`}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Will Carry Over</h3>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{Math.round(analytics.aggregate.totalWillCarryover)}</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Days to next year</p>
                  </div>
                </div>

                <div className={`card card-hover ${analytics.aggregate.totalWillLose > 0 ? 'border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : ''}`}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Will Be Lost</h3>
                        <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{Math.round(analytics.aggregate.totalWillLose)}</p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-700 dark:text-red-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Days lost at year end</p>
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
                      <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">Team Competition Context</p>
                      <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                        <strong>{analytics.aggregate.membersCount}</strong> team member{analytics.aggregate.membersCount !== 1 ? 's' : ''} 
                        {' '}need to coordinate use of <strong>{Math.round(analytics.aggregate.totalRealisticUsableDays)}</strong> realistic usable days.
                        {analytics.aggregate.totalRemainderDays > 0 && (
                          <> <strong className="text-blue-600 dark:text-blue-400">+{analytics.aggregate.totalRemainderDays}</strong> day(s) need allocation decisions</>
                        )}
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-400">
                        Average of <strong>{Math.round(analytics.aggregate.averageDaysPerMemberAcrossTeam)}</strong> days per member available across the team.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Availability Constraint Info */}
              {analytics.aggregate.totalRealisticUsableDays < analytics.aggregate.totalTheoreticalWorkingDays && (
                <div className="card border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30 mb-6">
                  <div className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                        <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-orange-900 dark:text-orange-300 mb-1">Concurrent Leave Constraints Active</p>
                        <p className="text-sm text-orange-700 dark:text-orange-400">
                          Team members can realistically use <strong>{Math.round(analytics.aggregate.totalRealisticUsableDays)}</strong> of <strong>{Math.round(analytics.aggregate.totalTheoreticalWorkingDays)}</strong> theoretical working days remaining.
                          Some periods are fully booked due to concurrent leave limits.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Policy Info */}
              {team && (
                <div className={`card ${team.settings.allowCarryover ? 'border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30' : 'border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30'}`}>
                  <div className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${team.settings.allowCarryover ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                        {team.settings.allowCarryover ? (
                          <CheckCircleIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                        ) : (
                          <ExclamationTriangleIcon className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
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
