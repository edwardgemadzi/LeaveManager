'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, LeaveRequest } from '@/types';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { isMaternityLeave } from '@/lib/leaveCalculations';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { UsersIcon, CalendarIcon, ChartBarIcon } from '@heroicons/react/24/outline';

export default function LeaderAnalyticsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>('all');
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        if (!user.teamId) {
          console.error('No team ID found');
          return;
        }

        // Fetch all data in parallel
        const [teamResponse, requestsResponse, analyticsResponse] = await Promise.all([
          fetch('/api/team', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
          fetch('/api/leave-requests', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
          fetch(`/api/analytics?t=${Date.now()}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            cache: 'no-store',
          }),
        ]);

        // Process team response
        if (!teamResponse.ok) {
          console.error('Failed to fetch team data:', teamResponse.status);
        } else {
          const teamData = await teamResponse.json();
          setTeam(teamData.team);
        }

        // Process requests response
        if (requestsResponse.ok) {
          const requestsData = await requestsResponse.json();
          setAllRequests(requestsData.requests || []);
        }

        // Process analytics response
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

  useEffect(() => {
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
  }, []);

  // Real-time updates using SSE
  useTeamEvents(team?._id || null, {
    enabled: !loading && !!team,
    onEvent: (event) => {
      // Refresh analytics when leave requests are updated or settings change
      if (event.type === 'leaveRequestUpdated' || event.type === 'leaveRequestDeleted' || event.type === 'settingsUpdated') {
        // Debounce refresh to avoid excessive API calls
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        refreshTimeoutRef.current = setTimeout(() => {
          fetchData();
        }, 500);
      }
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading analytics...</p>
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

  // Calculate total realistic carryover usable days (considering limitations)
  const totalRealisticCarryoverUsableDays = allMembers.reduce((sum, m) => 
    sum + (m.analytics.realisticCarryoverUsableDays || 0), 0
  );

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">End of Year Analytics</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400 mb-2">
              Comprehensive analytics and projections for {currentYear}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {daysElapsed} days elapsed, {daysRemaining} days remaining in the year
            </p>
          </div>

          {/* Year Summary Cards - Enhanced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Members</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {totalMembers}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Team members</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                      <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Remaining</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(totalRemainingBalance)}
                      {totalSurplus > 0 && (
                        <span className="ml-2 text-lg sm:text-xl text-green-600 dark:text-green-400">
                          (+{Math.round(totalSurplus)})
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500 dark:text-gray-500">Days remaining</p>
                      {totalSurplus > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                          {membersWithSurplus} with surplus
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                      <CalendarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Realistic Usable</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(totalRealisticUsableDays)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500 dark:text-gray-500">Usable days</p>
                      {totalRemainderDays > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                          +{totalRemainderDays} need allocation
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                      <ChartBarIcon className="h-6 w-6 text-purple-700 dark:text-purple-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-card group">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Avg Balance</p>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 fade-in">
                      {Math.round(avgRemainingBalance)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Average remaining</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                      <span className="text-yellow-600 dark:text-yellow-400 text-xl">⚖️</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* End of Year Projections - Enhanced */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">End of Year Projections</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
                <div className="bg-blue-50/50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">Projected Usage</p>
                  <p className="text-3xl sm:text-4xl font-bold text-blue-900 dark:text-blue-300 mb-2">{Math.round(projectionUsage)}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Based on realistic usable days available
                  </p>
                </div>
                
                {team.settings.allowCarryover ? (
                  <>
                    <div className="bg-green-50/50 dark:bg-green-900/20 rounded-xl p-5 border border-green-200 dark:border-green-800">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-2">Will Carryover</p>
                      <p className="text-3xl sm:text-4xl font-bold text-green-900 dark:text-green-300 mb-2">{Math.round(willCarryover)}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Unused days carried to next year
                      </p>
                    </div>
                    {willCarryover > 0 && totalRealisticCarryoverUsableDays > 0 && (
                      <div className="bg-teal-50/50 dark:bg-teal-900/20 rounded-xl p-5 border border-teal-200 dark:border-teal-800">
                        <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-2">Realistic Carryover Usage</p>
                        <p className="text-3xl sm:text-4xl font-bold text-teal-900 dark:text-teal-300 mb-2">{Math.round(totalRealisticCarryoverUsableDays)}</p>
                        <p className="text-xs text-teal-600 dark:text-teal-400">
                          {team.settings.carryoverSettings?.limitedToMonths && team.settings.carryoverSettings.limitedToMonths.length > 0 ? (
                            `Effective days considering month limitations`
                          ) : (
                            `Usable carryover days`
                          )}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-red-50/50 dark:bg-red-900/20 rounded-xl p-5 border border-red-200 dark:border-red-800">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">Will Be Lost</p>
                    <p className="text-3xl sm:text-4xl font-bold text-red-900 dark:text-red-300 mb-2">{Math.round(willLose)}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Unused days lost at year end
                    </p>
                  </div>
                )}

                <div className="bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Utilization Rate</p>
                  <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    {totalRemainingBalance > 0 
                      ? Math.round((projectionUsage / totalRemainingBalance) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    % of remaining balance that will be used
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters - Enhanced */}
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Subgroup Filter */}
                {team.settings.enableSubgrouping && subgroups.length > 0 && (
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Filter by Subgroup:</label>
                    <select
                      value={selectedSubgroup}
                      onChange={(e) => setSelectedSubgroup(e.target.value)}
                      className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:w-auto sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                    >
                      <option value="all">All Subgroups</option>
                      {subgroups.map(subgroup => (
                        <option key={subgroup} value={subgroup}>{subgroup}</option>
                      ))}
                      <option value="Ungrouped">Ungrouped</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grouped Analytics - Enhanced */}
          <div className="space-y-8 mb-8">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">Grouped Analytics</h2>
            
            {!analytics.groups || filteredGroups.length === 0 ? (
              <div className="card">
                <div className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <ChartBarIcon className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
                    <p className="text-base font-medium text-gray-500 dark:text-gray-400 mb-2">No analytics data available</p>
                    {analytics.groups && analytics.groups.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        No members found. Add team members to see analytics.
                      </p>
                    )}
                    {filteredGroups.length === 0 && selectedSubgroup !== 'all' && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        No members found in selected subgroup filter.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              filteredGroups.map((group, index) => {
                // Group members for display
                const groupMembers = group.members || [];
                
                return (
                  <div key={group.groupKey || index} className="card stagger-item">
                    <div className="p-5 sm:p-6">
                      <div className="mb-6">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
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
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''} in this group
                        </p>
                      </div>

                      {/* Group Aggregate Stats */}
                      {(() => {
                        const groupSurplus = groupMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
                        const groupMembersWithSurplus = groupMembers.filter(m => m.analytics.surplusBalance > 0).length;
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
                            <div className="bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Remaining Balance</p>
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

                            <div className="bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Realistic Usable Days</p>
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

                            <div className="bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Usable Days</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                          {Math.round(group.aggregate.groupTotalUsableDays)}
                        </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Avg: {Math.round(group.aggregate.groupAverageUsableDays)}
                        </p>
                      </div>

                            <div className="bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Competition Level</p>
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
                      <div className="border-t border-gray-200 dark:border-gray-800 pt-6 mt-6">
                        <h4 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4">Member Details</h4>
                        <div className="space-y-3">
                          {groupMembers.map((member) => (
                            <div key={member.userId} className="flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {member.fullName || member.username}
                                </p>
                                {member.fullName && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{member.username}</p>
                                )}
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
                                  const isNegative = member.analytics.remainingLeaveBalance < 0;
                                  
                                  // Check for compassionate leave if negative
                                  let hasCompassionateLeave = false;
                                  if (isNegative) {
                                    const memberCompassionateRequests = allRequests.filter(req => 
                                      req.userId === member.userId && 
                                      req.status === 'approved' && 
                                      req.reason && 
                                      (isMaternityLeave(req.reason) || 
                                       req.reason.toLowerCase().includes('sick') ||
                                       req.reason.toLowerCase().includes('bereavement') ||
                                       req.reason.toLowerCase().includes('medical') ||
                                       req.reason.toLowerCase().includes('family emergency') ||
                                       req.reason.toLowerCase().includes('emergency'))
                                    );
                                    hasCompassionateLeave = memberCompassionateRequests.length > 0;
                                  }
                                  
                                  return (
                                    <div>
                                      <p className={`font-medium ${isNegative ? (hasCompassionateLeave ? 'text-pink-600 dark:text-pink-400' : 'text-red-600 dark:text-red-400') : balanceColor}`}>
                                        {isNegative 
                                          ? `-${Math.round(Math.abs(member.analytics.remainingLeaveBalance))}`
                                          : Math.round(member.analytics.remainingLeaveBalance)
                                        }
                                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(remaining)</span>
                                        {isNegative && (() => {
                                          // Check if member has taken compassionate leave (maternity, sick, bereavement, medical, etc.)
                                          const memberCompassionateRequests = allRequests.filter(req => 
                                            req.userId === member.userId && 
                                            req.status === 'approved' && 
                                            req.reason && 
                                            (isMaternityLeave(req.reason) || 
                                             req.reason.toLowerCase().includes('sick') ||
                                             req.reason.toLowerCase().includes('bereavement') ||
                                             req.reason.toLowerCase().includes('medical') ||
                                             req.reason.toLowerCase().includes('family emergency') ||
                                             req.reason.toLowerCase().includes('emergency'))
                                          );
                                          const hasCompassionateLeave = memberCompassionateRequests.length > 0;
                                          
                                          // Determine compassionate reason for message
                                          let compassionateNote = '';
                                          if (hasCompassionateLeave) {
                                            if (memberCompassionateRequests.some(r => isMaternityLeave(r.reason || ''))) {
                                              compassionateNote = ' (maternity/paternity noted)';
                                            } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('sick'))) {
                                              compassionateNote = ' (sick leave noted)';
                                            } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('bereavement'))) {
                                              compassionateNote = ' (bereavement leave noted)';
                                            } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('medical'))) {
                                              compassionateNote = ' (medical leave noted)';
                                            } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('emergency'))) {
                                              compassionateNote = ' (emergency leave noted)';
                                            } else {
                                              compassionateNote = ' (necessary leave noted)';
                                            }
                                          }
                                          
                                          const textColor = hasCompassionateLeave 
                                            ? 'text-pink-600 dark:text-pink-400'
                                            : 'text-red-600 dark:text-red-400';
                                          
                                          return (
                                            <span className={`ml-1 text-xs ${textColor} font-medium`}>
                                              will be adjusted next year{compassionateNote}
                                            </span>
                                          );
                                        })()}
                                        {member.analytics.surplusBalance > 0 && !isNegative && (
                                          <span className="ml-1 text-xs text-green-600 dark:text-green-400">
                                            (+{Math.round(member.analytics.surplusBalance)})
                                          </span>
                                        )}
                                      </p>
                                      {isNegative && (() => {
                                        // Check if member has taken compassionate leave (maternity, sick, bereavement, medical, etc.)
                                        const memberCompassionateRequests = allRequests.filter(req => 
                                          req.userId === member.userId && 
                                          req.status === 'approved' && 
                                          req.reason && 
                                          (isMaternityLeave(req.reason) || 
                                           req.reason.toLowerCase().includes('sick') ||
                                           req.reason.toLowerCase().includes('bereavement') ||
                                           req.reason.toLowerCase().includes('medical') ||
                                           req.reason.toLowerCase().includes('family emergency') ||
                                           req.reason.toLowerCase().includes('emergency'))
                                        );
                                        const hasCompassionateLeave = memberCompassionateRequests.length > 0;
                                        
                                        // Determine compassionate reason for message
                                        let compassionateNote = '';
                                        if (hasCompassionateLeave) {
                                          if (memberCompassionateRequests.some(r => isMaternityLeave(r.reason || ''))) {
                                            compassionateNote = ' - maternity/paternity leave noted';
                                          } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('sick'))) {
                                            compassionateNote = ' - sick leave noted';
                                          } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('bereavement'))) {
                                            compassionateNote = ' - bereavement leave noted';
                                          } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('medical'))) {
                                            compassionateNote = ' - medical leave noted';
                                          } else if (memberCompassionateRequests.some(r => r.reason?.toLowerCase().includes('emergency'))) {
                                            compassionateNote = ' - emergency leave noted';
                                          } else {
                                            compassionateNote = ' - necessary leave noted';
                                          }
                                        }
                                        
                                        const textColor = hasCompassionateLeave 
                                          ? 'text-pink-600 dark:text-pink-400'
                                          : 'text-red-600 dark:text-red-400';
                                        
                                        return (
                                          <p className={`text-xs ${textColor} mt-0.5 font-medium`}>
                                            {Math.round(Math.abs(member.analytics.remainingLeaveBalance))} day{Math.abs(member.analytics.remainingLeaveBalance) !== 1 ? 's' : ''} over allocated
                                            {compassionateNote}
                                          </p>
                                        );
                                      })()}
                                    </div>
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

