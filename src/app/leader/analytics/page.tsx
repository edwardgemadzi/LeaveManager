'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, User, LeaveRequest } from '@/types';
import { GroupedTeamAnalytics, getMaternityMemberAnalytics } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { calculateMaternityLeaveBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { UsersIcon, CalendarIcon, ChartBarIcon } from '@heroicons/react/24/outline';

export default function LeaderAnalyticsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>('all');
  const [showMaternityLeave, setShowMaternityLeave] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        if (!user.teamId) {
          console.error('No team ID found');
          return;
        }

        // Fetch team data
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!teamResponse.ok) {
          console.error('Failed to fetch team data:', teamResponse.status);
          return;
        }
        
        const teamData = await teamResponse.json();
        setTeam(teamData.team);
        setMembers(teamData.members || []);

        // Fetch leave requests
        const requestsResponse = await fetch('/api/leave-requests', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (requestsResponse.ok) {
          const requestsData = await requestsResponse.json();
          setAllRequests(requestsData.requests || []);
        }

        // Fetch analytics
        const analyticsResponse = await fetch('/api/analytics', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          
          // The API returns { analytics: groupedAnalytics }
          const groupedData = analyticsData.analytics || analyticsData.grouped || null;
          
          if (groupedData) {
            setAnalytics(groupedData);
          } else {
            console.error('Analytics page - No analytics data found in response');
            setAnalytics(null);
          }
        } else {
          const errorText = await analyticsResponse.text();
          console.error('Analytics API error:', analyticsResponse.status, errorText);
          setAnalytics(null);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500 mx-auto mb-4"></div>
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
            {analytics && analytics.groups && analytics.groups.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                No members found. Add team members to see analytics.
              </p>
            )}
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

  // Get subgroups if subgrouping is enabled
  const subgroups = team.settings.enableSubgrouping && team.settings.subgroups 
    ? team.settings.subgroups 
    : [];

  // Filter groups by selected subgroup
  const filteredGroups = selectedSubgroup === 'all' 
    ? analytics.groups 
    : analytics.groups.filter(g => {
        if (team.settings.enableSubgrouping) {
          const groupSubgroup = g.subgroupTag || 'Ungrouped';
          return groupSubgroup === selectedSubgroup;
        }
        return true;
      });

  // Check if analytics has required data
  if (!analytics.aggregate || !analytics.groups) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">Analytics data structure is invalid</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Please check the console for details</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate year-end projections
  const totalMembers = analytics.aggregate.membersCount || 0;
  const totalRemainingBalance = analytics.aggregate.totalRemainingLeaveBalance || 0;
  const avgRemainingBalance = analytics.aggregate.averageRemainingBalance || 0;
  const totalRealisticUsableDays = analytics.aggregate.totalRealisticUsableDays || 0;
  const totalRemainderDays = analytics.aggregate.totalRemainderDays || 0;

  // Calculate total surplus balance across all members
  const allMembers = analytics.groups.flatMap(group => group.members);
  const totalSurplus = allMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
  const membersWithSurplus = allMembers.filter(m => m.analytics.surplusBalance > 0).length;

  // Project end of year usage
  const projectionUsage = totalRemainingBalance > totalRealisticUsableDays 
    ? totalRealisticUsableDays 
    : totalRemainingBalance;

  const willCarryover = team.settings.allowCarryover 
    ? Math.max(0, totalRemainingBalance - projectionUsage)
    : 0;

  const willLose = team.settings.allowCarryover 
    ? 0 
    : Math.max(0, totalRemainingBalance - projectionUsage);

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
          <div className="px-4 py-6 sm:px-0 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">End of Year Analytics</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Comprehensive analytics and projections for {currentYear}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {daysElapsed} days elapsed, {daysRemaining} days remaining in the year
            </p>
          </div>

          {/* Year Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalMembers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <CalendarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Remaining</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {Math.round(totalRemainingBalance)}
                    {totalSurplus > 0 && (
                      <span className="ml-2 text-lg text-green-600">
                        (+{Math.round(totalSurplus)} surplus)
                      </span>
                    )}
                  </p>
                  {totalSurplus > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      {membersWithSurplus} member(s) with surplus
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="h-6 w-6 text-purple-700 dark:text-purple-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Realistic Usable</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalRealisticUsableDays)}</p>
                  {totalRemainderDays > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                      +{totalRemainderDays} day(s) need allocation
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                    <span className="text-yellow-600 dark:text-yellow-400 text-xl">⚖️</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Balance</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(avgRemainingBalance)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* End of Year Projections */}
          <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 mb-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">End of Year Projections</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Projected Usage</p>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">{Math.round(projectionUsage)} days</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Based on realistic usable days available
                </p>
              </div>
              
              {team.settings.allowCarryover ? (
                <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Will Carryover</p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-300">{Math.round(willCarryover)} days</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Unused days carried to next year
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Will Be Lost</p>
                  <p className="text-3xl font-bold text-red-900 dark:text-red-300">{Math.round(willLose)} days</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Unused days lost at year end
                  </p>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Utilization Rate</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {totalRemainingBalance > 0 
                    ? Math.round((projectionUsage / totalRemainingBalance) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  % of remaining balance that will be used
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-4 mb-6 border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Subgroup Filter */}
              {team.settings.enableSubgrouping && subgroups.length > 0 && (
                <div className="flex items-center space-x-4">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Subgroup:</label>
                  <select
                    value={selectedSubgroup}
                    onChange={(e) => setSelectedSubgroup(e.target.value)}
                    className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                  >
                    <option value="all">All Subgroups</option>
                    {subgroups.map(subgroup => (
                      <option key={subgroup} value={subgroup}>{subgroup}</option>
                    ))}
                    <option value="Ungrouped">Ungrouped</option>
                  </select>
                </div>
              )}
              
              {/* Maternity Leave Toggle */}
              <div className="flex items-center space-x-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Maternity/Paternity Leave:</label>
                <button
                  type="button"
                  onClick={() => setShowMaternityLeave(!showMaternityLeave)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    showMaternityLeave ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      showMaternityLeave ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Grouped Analytics */}
          <div className="space-y-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Grouped Analytics</h2>
            
            {!analytics.groups || filteredGroups.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-8 text-center border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 dark:text-gray-400 mb-2">No analytics data available</p>
                {analytics.groups && analytics.groups.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    No members found. Add team members to see analytics.
                  </p>
                )}
                {filteredGroups.length === 0 && selectedSubgroup !== 'all' && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    No members found in selected subgroup filter.
                  </p>
                )}
              </div>
            ) : (
              filteredGroups.map((group, index) => {
                // Group members for display
                const groupMembers = group.members || [];
                
                return (
                  <div key={group.groupKey || index} className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {team.settings.enableSubgrouping && group.subgroupTag ? (
                          <>
                            Subgroup: <span className="text-indigo-600 dark:text-indigo-400">{group.subgroupTag}</span>
                            {group.shiftTag && (
                              <> • <span className="text-gray-600 dark:text-gray-400">{group.shiftTag} Shift</span></>
                            )}
                          </>
                        ) : (
                          <>
                            <span>{group.shiftTag ? `${group.shiftTag} Shift` : 'All Members'}</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 ml-2">
                              {getWorkingDaysGroupDisplayName(group.workingDaysTag, team?.settings)}
                              {team?.settings?.workingDaysGroupNames?.[group.workingDaysTag] && (
                                <span className="ml-1 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
                                  ({group.workingDaysTag})
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''} in this group
                      </p>
                    </div>

                    {/* Group Aggregate Stats */}
                    {(() => {
                      const groupSurplus = groupMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
                      const groupMembersWithSurplus = groupMembers.filter(m => m.analytics.surplusBalance > 0).length;
                      return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Remaining Balance</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                              {Math.round(group.aggregate.groupTotalLeaveBalance)}
                              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(remaining)</span>
                              {groupSurplus > 0 && (
                                <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                                  (+{Math.round(groupSurplus)})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Avg: {Math.round(group.aggregate.groupAverageLeaveBalance)} (remaining)
                            </p>
                            {groupSurplus > 0 && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                {groupMembersWithSurplus} member(s) with surplus
                        </p>
                            )}
                      </div>

                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Realistic Usable Days</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                          {Math.round(group.aggregate.groupTotalRealisticUsableDays)}
                        </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Avg: {Math.round(group.aggregate.groupAverageRealisticUsableDays)}
                            </p>
                            {group.aggregate.groupTotalRemainderDays > 0 && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                                +{group.aggregate.groupTotalRemainderDays} day(s) need allocation
                        </p>
                            )}
                      </div>

                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Usable Days</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                          {Math.round(group.aggregate.groupTotalUsableDays)}
                        </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Avg: {Math.round(group.aggregate.groupAverageUsableDays)}
                        </p>
                      </div>

                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Competition Level</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                          {groupMembers.length} members
                        </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {groupMembers.length > 0 
                                ? Math.round(group.aggregate.groupTotalRealisticUsableDays / groupMembers.length)
                            : 0} days/member
                        </p>
                      </div>
                    </div>
                      );
                    })()}

                    {/* Group Members Detail */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Member Details</h4>
                      <div className="space-y-2">
                        {groupMembers.map((member) => (
                          <div key={member.userId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-800">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {member.fullName || member.username}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{member.username}</p>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                              <div className="text-right">
                                <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                                {(() => {
                                  // Color balance text based on realistic usable days vs remaining balance
                                  const realisticUsableDays = member.analytics.realisticUsableDays ?? 0;
                                  const remainingBalance = member.analytics.remainingLeaveBalance;
                                  const balanceColor = realisticUsableDays >= remainingBalance
                                    ? 'text-green-600 dark:text-green-400' // Good - can use all days
                                    : (() => {
                                        const realisticPercentage = remainingBalance > 0
                                          ? (realisticUsableDays / remainingBalance) * 100
                                          : 0;
                                        if (realisticPercentage < 30) {
                                          return 'text-red-600 dark:text-red-400'; // Very bad - will lose most days
                                        } else if (realisticPercentage < 70) {
                                          return 'text-orange-600 dark:text-orange-400'; // Moderate - will lose some days
                                        } else {
                                          return 'text-red-500 dark:text-red-400'; // Bad - will lose some days
                                        }
                                      })();
                                  return (
                                    <p className={`font-medium ${balanceColor}`}>
                                      {Math.round(member.analytics.remainingLeaveBalance)}
                                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(remaining)</span>
                                      {member.analytics.surplusBalance > 0 && (
                                        <span className="ml-1 text-xs text-green-600 dark:text-green-400">
                                          (+{Math.round(member.analytics.surplusBalance)})
                                        </span>
                                      )}
                                    </p>
                                  );
                                })()}
                                {/* Show base balance if different from remaining balance */}
                                {Math.round(member.analytics.baseLeaveBalance) !== Math.round(member.analytics.remainingLeaveBalance) && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                    <span className="font-medium">Base:</span> {Math.round(member.analytics.baseLeaveBalance)}
                                    <span className="ml-1 text-gray-500 dark:text-gray-400">
                                      ({Math.round(member.analytics.baseLeaveBalance - member.analytics.remainingLeaveBalance)} used)
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500 dark:text-gray-400">Realistic</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {Math.round(member.analytics.realisticUsableDays)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500 dark:text-gray-400">Usable</p>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {Math.round(member.analytics.usableDays)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Maternity Leave Analytics */}
          {showMaternityLeave && team && members.length > 0 && (() => {
            const maxMaternityLeaveDays = team.settings.maternityLeave?.maxDays || 90;
            const countingMethod = team.settings.maternityLeave?.countingMethod || 'working';
            
            // Calculate maternity leave analytics for all members
            const memberMaternityAnalytics = members
              .filter(m => m.role === 'member')
              .map(member => {
                const memberRequests = allRequests.filter(req => 
                  req.userId === member._id && req.status === 'approved'
                );
                
                const maternityAnalytics = getMaternityMemberAnalytics(
                  member,
                  team,
                  memberRequests
                );
                
                return {
                  member,
                  analytics: maternityAnalytics
                };
              })
              .filter(m => m.analytics.baseMaternityLeaveBalance > 0); // Only show members with maternity leave

            const totalMaternityRemaining = memberMaternityAnalytics.reduce((sum, m) => sum + m.analytics.remainingMaternityLeaveBalance, 0);
            const totalMaternityUsed = memberMaternityAnalytics.reduce((sum, m) => sum + m.analytics.maternityDaysUsed, 0);
            const avgMaternityRemaining = memberMaternityAnalytics.length > 0 ? totalMaternityRemaining / memberMaternityAnalytics.length : 0;

            return (
              <div className="space-y-6 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Maternity/Paternity Leave Analytics</h2>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                          <CalendarIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Remaining</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalMaternityRemaining)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                          <ChartBarIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Used</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalMaternityUsed)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                          <UsersIcon className="h-6 w-6 text-pink-700 dark:text-pink-400" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Remaining</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(avgMaternityRemaining)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {memberMaternityAnalytics.length} member(s) with maternity leave
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Member Maternity Leave Details */}
                {memberMaternityAnalytics.length > 0 ? (
                  <div className="bg-white dark:bg-gray-900 shadow rounded-lg border border-gray-100 dark:border-gray-800">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Member Maternity/Paternity Leave Details</h3>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                      {memberMaternityAnalytics.map(({ member, analytics: maternityAnalytics }) => (
                        <div key={member._id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-900">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                {member.fullName || member.username}
                              </h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{member.username}</p>
                            </div>
                            <div className="text-right mr-6">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {Math.round(maternityAnalytics.remainingMaternityLeaveBalance)} / {maxMaternityLeaveDays}
                              </p>
                              {maternityAnalytics.surplusMaternityBalance > 0 && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                  +{Math.round(maternityAnalytics.surplusMaternityBalance)} surplus
                                </p>
                              )}
                            </div>
                            <div className="text-right mr-6">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Used</p>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {Math.round(maternityAnalytics.maternityDaysUsed)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Base</p>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {Math.round(maternityAnalytics.baseMaternityLeaveBalance)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-8 text-center border border-gray-100 dark:border-gray-800">
                    <p className="text-gray-500 dark:text-gray-400">No maternity/paternity leave data available</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </ProtectedRoute>
  );
}

