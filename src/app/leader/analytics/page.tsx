'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team } from '@/types';
import { GroupedTeamAnalytics } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';

export default function LeaderAnalyticsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>('all');

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
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics || !team) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-2">No analytics data available</p>
            <p className="text-sm text-gray-500">
              {!analytics ? 'Analytics data not loaded' : ''}
              {!team ? 'Team data not loaded' : ''}
            </p>
            {analytics && analytics.groups && analytics.groups.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
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
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-2">Analytics data structure is invalid</p>
            <p className="text-sm text-gray-500">Please check the console for details</p>
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
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
          <div className="px-4 py-6 sm:px-0 mb-6">
            <h1 className="text-3xl font-bold text-gray-900">End of Year Analytics</h1>
            <p className="mt-2 text-gray-600">
              Comprehensive analytics and projections for {currentYear}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {daysElapsed} days elapsed, {daysRemaining} days remaining in the year
            </p>
          </div>

          {/* Year Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 text-xl">👥</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900">{totalMembers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 text-xl">📅</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Remaining</p>
                  <p className="text-2xl font-bold text-gray-900">
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

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 text-xl">📊</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Realistic Usable</p>
                  <p className="text-2xl font-bold text-gray-900">{Math.round(totalRealisticUsableDays)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <span className="text-yellow-600 text-xl">⚖️</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Avg Balance</p>
                  <p className="text-2xl font-bold text-gray-900">{avgRemainingBalance.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* End of Year Projections */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">End of Year Projections</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-700 mb-1">Projected Usage</p>
                <p className="text-3xl font-bold text-blue-900">{Math.round(projectionUsage)} days</p>
                <p className="text-xs text-blue-600 mt-2">
                  Based on realistic usable days available
                </p>
              </div>
              
              {team.settings.allowCarryover ? (
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-700 mb-1">Will Carryover</p>
                  <p className="text-3xl font-bold text-green-900">{willCarryover.toFixed(1)} days</p>
                  <p className="text-xs text-green-600 mt-2">
                    Unused days carried to next year
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-700 mb-1">Will Be Lost</p>
                  <p className="text-3xl font-bold text-red-900">{willLose.toFixed(1)} days</p>
                  <p className="text-xs text-red-600 mt-2">
                    Unused days lost at year end
                  </p>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Utilization Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {totalRemainingBalance > 0 
                    ? ((projectionUsage / totalRemainingBalance) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  % of remaining balance that will be used
                </p>
              </div>
            </div>
          </div>

          {/* Subgroup Filter */}
          {team.settings.enableSubgrouping && subgroups.length > 0 && (
            <div className="bg-white shadow rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Filter by Subgroup:</label>
                <select
                  value={selectedSubgroup}
                  onChange={(e) => setSelectedSubgroup(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Subgroups</option>
                  {subgroups.map(subgroup => (
                    <option key={subgroup} value={subgroup}>{subgroup}</option>
                  ))}
                  <option value="Ungrouped">Ungrouped</option>
                </select>
              </div>
            </div>
          )}

          {/* Grouped Analytics */}
          <div className="space-y-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Grouped Analytics</h2>
            
            {!analytics.groups || filteredGroups.length === 0 ? (
              <div className="bg-white shadow rounded-lg p-8 text-center">
                <p className="text-gray-500 mb-2">No analytics data available</p>
                {analytics.groups && analytics.groups.length === 0 && (
                  <p className="text-sm text-gray-400 mt-2">
                    No members found. Add team members to see analytics.
                  </p>
                )}
                {filteredGroups.length === 0 && selectedSubgroup !== 'all' && (
                  <p className="text-sm text-gray-400 mt-2">
                    No members found in selected subgroup filter.
                  </p>
                )}
              </div>
            ) : (
              filteredGroups.map((group, index) => {
                // Group members for display
                const groupMembers = group.members || [];
                
                return (
                  <div key={group.groupKey || index} className="bg-white shadow rounded-lg p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {team.settings.enableSubgrouping && group.subgroupTag ? (
                          <>
                            Subgroup: <span className="text-indigo-600">{group.subgroupTag}</span>
                            {group.shiftTag && (
                              <> • <span className="text-gray-600">{group.shiftTag} Shift</span></>
                            )}
                          </>
                        ) : (
                          <>
                            <span>{group.shiftTag ? `${group.shiftTag} Shift` : 'All Members'}</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ml-2">
                              {getWorkingDaysGroupDisplayName(group.workingDaysTag, team?.settings)}
                              {team?.settings?.workingDaysGroupNames?.[group.workingDaysTag] && (
                                <span className="ml-1 text-gray-500 font-mono text-[10px]">
                                  ({group.workingDaysTag})
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''} in this group
                      </p>
                    </div>

                    {/* Group Aggregate Stats */}
                    {(() => {
                      const groupSurplus = groupMembers.reduce((sum, m) => sum + m.analytics.surplusBalance, 0);
                      const groupMembersWithSurplus = groupMembers.filter(m => m.analytics.surplusBalance > 0).length;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-xs font-medium text-gray-500">Remaining Balance</p>
                            <p className="text-xl font-bold text-gray-900 mt-1">
                              {Math.round(group.aggregate.groupTotalLeaveBalance)}
                              <span className="ml-1 text-xs text-gray-500">(remaining)</span>
                              {groupSurplus > 0 && (
                                <span className="ml-2 text-sm text-green-600">
                                  (+{Math.round(groupSurplus)})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Avg: {group.aggregate.groupAverageLeaveBalance.toFixed(1)} (remaining)
                            </p>
                            {groupSurplus > 0 && (
                              <p className="text-xs text-green-600 mt-1">
                                {groupMembersWithSurplus} member(s) with surplus
                              </p>
                            )}
                          </div>

                          <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-medium text-gray-500">Realistic Usable Days</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                          {Math.round(group.aggregate.groupTotalRealisticUsableDays)}
                        </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Avg: {group.aggregate.groupAverageRealisticUsableDays.toFixed(1)}
                            </p>
                          </div>

                          <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-medium text-gray-500">Usable Days</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                          {Math.round(group.aggregate.groupTotalUsableDays)}
                        </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Avg: {group.aggregate.groupAverageUsableDays.toFixed(1)}
                            </p>
                          </div>

                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-xs font-medium text-gray-500">Competition Level</p>
                            <p className="text-xl font-bold text-gray-900 mt-1">
                              {groupMembers.length} members
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {groupMembers.length > 0 
                                ? (group.aggregate.groupTotalRealisticUsableDays / groupMembers.length).toFixed(1)
                                : 0} days/member
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Group Members Detail */}
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Member Details</h4>
                      <div className="space-y-2">
                        {groupMembers.map((member) => (
                          <div key={member.userId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {member.fullName || member.username}
                              </p>
                              <p className="text-xs text-gray-500">{member.username}</p>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                              <div className="text-right">
                                <p className="text-xs text-gray-500">Balance</p>
                                <p className="font-medium text-gray-900">
                                  {Math.round(member.analytics.remainingLeaveBalance)}
                                  <span className="ml-1 text-xs text-gray-500">(remaining)</span>
                                  {member.analytics.surplusBalance > 0 && (
                                    <span className="ml-1 text-xs text-green-600">
                                      (+{Math.round(member.analytics.surplusBalance)})
                                    </span>
                                  )}
                                </p>
                                {/* Show base balance if different from remaining balance */}
                                {Math.round(member.analytics.baseLeaveBalance) !== Math.round(member.analytics.remainingLeaveBalance) && (
                                  <p className="text-xs text-gray-600 mt-0.5">
                                    <span className="font-medium">Base:</span> {Math.round(member.analytics.baseLeaveBalance)}
                                    <span className="ml-1 text-gray-500">
                                      ({Math.round(member.analytics.baseLeaveBalance - member.analytics.remainingLeaveBalance)} used)
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500">Realistic</p>
                                <p className="font-medium text-gray-900">
                                  {Math.round(member.analytics.realisticUsableDays)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500">Usable</p>
                                <p className="font-medium text-gray-900">
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
        </div>
      </div>
    </ProtectedRoute>
  );
}

