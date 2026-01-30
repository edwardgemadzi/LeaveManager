'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import TeamCalendar from '@/components/shared/Calendar';
import { Team, User, LeaveRequest } from '@/types';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';
import { useTeamEvents } from '@/hooks/useTeamEvents';

export default function LeaderCalendarPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedSubgroups, setSelectedSubgroups] = useState<string[]>([]);
  const [selectedWorkingDaysTags, setSelectedWorkingDaysTags] = useState<string[]>([]);

  const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Fetch team and requests in parallel
        const [teamResponse, requestsResponse] = await Promise.all([
          fetch('/api/team', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
          fetch(`/api/leave-requests?teamId=${user.teamId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
        ]);

        // Process team response
        const teamData = await teamResponse.json();
        setTeam(teamData.team);
        setMembers(teamData.members);

        // Process requests response
        const requestsData = await requestsResponse.json();
        setAllRequests(requestsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time updates using SSE
  useTeamEvents(team?._id || null, {
    enabled: !loading && !!team,
    onEvent: (event) => {
      // Refresh calendar when leave requests are created, updated, or deleted
      if (event.type === 'leaveRequestCreated' || event.type === 'leaveRequestUpdated' || event.type === 'leaveRequestDeleted' || event.type === 'leaveRequestRestored') {
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

  // Get unique subgroups and working days tags from members
  const uniqueSubgroups = useMemo(() => {
    if (!team?.settings.enableSubgrouping) return [];
    const subgroups = new Set<string>();
    members.forEach(m => {
      const subgroup = m.subgroupTag || 'Ungrouped';
      subgroups.add(subgroup);
    });
    return Array.from(subgroups).sort();
  }, [members, team?.settings.enableSubgrouping]);

  const uniqueWorkingDaysTags = useMemo(() => {
    const tagsMap = new Map<string, { tag: string; displayName: string; count: number }>();
    members.forEach(m => {
      if (!m.shiftSchedule) return;
      const tag = m.shiftSchedule.type === 'rotating'
        ? generateWorkingDaysTag(m.shiftSchedule)
        : (m.workingDaysTag || generateWorkingDaysTag(m.shiftSchedule));
      
      if (tag && tag !== 'no-schedule') {
        const existing = tagsMap.get(tag);
        if (existing) {
          existing.count++;
        } else {
          tagsMap.set(tag, {
            tag,
            displayName: getWorkingDaysGroupDisplayName(tag, team?.settings),
            count: 1
          });
        }
      }
    });
    return Array.from(tagsMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, team?.settings]);

  // Filter requests based on status, member, subgroup, and working days filters
  const filteredRequests = useMemo(() => {
    return allRequests.filter(request => {
      // Status filter (exclude rejected)
      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false;
      }
      
      // Find the member who made this request
      const requestMember = members.find(m => m._id === request.userId);
      if (!requestMember) return false;
      
      // Member filter - if no members selected, show all; otherwise show only selected members
      if (selectedMemberIds.length > 0 && !selectedMemberIds.includes(request.userId)) {
        return false;
      }
      
      // Subgroup filter - if subgroups are selected, filter by subgroup
      if (selectedSubgroups.length > 0 && team?.settings.enableSubgrouping) {
        const memberSubgroup = requestMember.subgroupTag || 'Ungrouped';
        if (!selectedSubgroups.includes(memberSubgroup)) {
          return false;
        }
      }
      
      // Working days tag filter - if tags are selected, filter by working days tag
      if (selectedWorkingDaysTags.length > 0) {
        const memberTag = requestMember.shiftSchedule?.type === 'rotating'
          ? generateWorkingDaysTag(requestMember.shiftSchedule)
          : (requestMember.workingDaysTag || generateWorkingDaysTag(requestMember.shiftSchedule));
        
        if (!memberTag || memberTag === 'no-schedule' || !selectedWorkingDaysTags.includes(memberTag)) {
          return false;
        }
      }
      
      return true;
    });
  }, [allRequests, statusFilter, selectedMemberIds, selectedSubgroups, selectedWorkingDaysTags, members, team?.settings]);

  // Handle member selection toggle
  const handleMemberToggle = (memberId: string) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(memberId)) {
        // Remove member if already selected
        return prev.filter(id => id !== memberId);
      } else {
        // Add member if not selected
        return [...prev, memberId];
      }
    });
  };

  // Handle "Select All Members" / "Clear All"
  const handleSelectAllMembers = () => {
    if (selectedMemberIds.length === members.filter(m => m.role === 'member').length) {
      // If all members are selected, clear selection (show all)
      setSelectedMemberIds([]);
    } else {
      // Select all members
      setSelectedMemberIds(members.filter(m => m.role === 'member').map(m => m._id!).filter(Boolean));
    }
  };

  // Handle subgroup selection toggle
  const handleSubgroupToggle = (subgroup: string) => {
    setSelectedSubgroups(prev => {
      if (prev.includes(subgroup)) {
        return prev.filter(s => s !== subgroup);
      } else {
        return [...prev, subgroup];
      }
    });
  };

  // Handle "Select All Subgroups" / "Clear All"
  const handleSelectAllSubgroups = () => {
    if (selectedSubgroups.length === uniqueSubgroups.length) {
      setSelectedSubgroups([]);
    } else {
      setSelectedSubgroups([...uniqueSubgroups]);
    }
  };

  // Handle working days tag selection toggle
  const handleWorkingDaysTagToggle = (tag: string) => {
    setSelectedWorkingDaysTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  // Handle "Select All Working Days Tags" / "Clear All"
  const handleSelectAllWorkingDaysTags = () => {
    if (selectedWorkingDaysTags.length === uniqueWorkingDaysTags.length) {
      setSelectedWorkingDaysTags([]);
    } else {
      setSelectedWorkingDaysTags(uniqueWorkingDaysTags.map(t => t.tag));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading calendar...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Navbar />
      
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
        {/* Header Section - Enhanced */}
        <div className="mb-8 fade-in">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Team Calendar</h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">View all leave requests for your team</p>
        </div>

        {/* Filter Tabs - Enhanced */}
        <div className="card mb-8">
          <div className="p-5 sm:p-6">
            <div className="border-b border-gray-200 dark:border-gray-800">
              <nav className="-mb-px flex flex-wrap gap-4 sm:gap-8">
              {[
                { key: 'all', label: 'All Requests' },
                { key: 'pending', label: 'Pending' },
                { key: 'approved', label: 'Approved' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key as 'all' | 'pending' | 'approved')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    statusFilter === tab.key
                      ? 'tab-active'
                      : 'tab-inactive'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Filters Section - Enhanced */}
        <div className="mb-8 space-y-4">
          {/* Member Filter */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter by Members:
              </label>
              <button
                onClick={handleSelectAllMembers}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
              >
                {selectedMemberIds.length === members.filter(m => m.role === 'member').length
                  ? 'Clear All'
                  : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.filter(m => m.role === 'member').map((member) => (
                <button
                  key={member._id}
                  onClick={() => handleMemberToggle(member._id!)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    selectedMemberIds.includes(member._id!)
                      ? 'bg-indigo-600 text-white dark:bg-indigo-700'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {member.fullName || member.username}
                </button>
              ))}
            </div>
            {selectedMemberIds.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Showing {selectedMemberIds.length} of {members.filter(m => m.role === 'member').length} members
              </p>
            )}
          </div>

          {/* Subgroup Filter (only show if subgrouping is enabled) */}
          {team?.settings.enableSubgrouping && uniqueSubgroups.length > 0 && (
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Filter by Subgroups:
                </label>
                <button
                  onClick={handleSelectAllSubgroups}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  {selectedSubgroups.length === uniqueSubgroups.length
                    ? 'Clear All'
                    : 'Select All'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueSubgroups.map((subgroup) => {
                  const memberCount = members.filter(m => (m.subgroupTag || 'Ungrouped') === subgroup).length;
                  return (
                    <button
                      key={subgroup}
                      onClick={() => handleSubgroupToggle(subgroup)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        selectedSubgroups.includes(subgroup)
                          ? 'bg-indigo-600 text-white dark:bg-indigo-700'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {subgroup} ({memberCount})
                    </button>
                  );
                })}
              </div>
              {selectedSubgroups.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Showing {selectedSubgroups.length} of {uniqueSubgroups.length} subgroups
                </p>
              )}
            </div>
          )}

          {/* Working Days Grouping Filter */}
          {uniqueWorkingDaysTags.length > 0 && (
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Filter by Working Days Groups:
                </label>
                <button
                  onClick={handleSelectAllWorkingDaysTags}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  {selectedWorkingDaysTags.length === uniqueWorkingDaysTags.length
                    ? 'Clear All'
                    : 'Select All'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueWorkingDaysTags.map((tagInfo) => (
                  <button
                    key={tagInfo.tag}
                    onClick={() => handleWorkingDaysTagToggle(tagInfo.tag)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedWorkingDaysTags.includes(tagInfo.tag)
                        ? 'bg-indigo-600 text-white dark:bg-indigo-700'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tagInfo.displayName} ({tagInfo.count})
                  </button>
                ))}
              </div>
              {selectedWorkingDaysTags.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Showing {selectedWorkingDaysTags.length} of {uniqueWorkingDaysTags.length} working days groups
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card rounded-none relative z-10">
          <div className="px-6 py-8 relative z-10">
            {team?._id ? (
              <TeamCalendar 
                teamId={team._id} 
                members={members}
                teamSettings={team?.settings ? { 
                  minimumNoticePeriod: team.settings.minimumNoticePeriod || 1,
                  maternityLeave: team.settings.maternityLeave,
                  paternityLeave: team.settings.paternityLeave
                } : undefined}
                initialRequests={filteredRequests}
              />
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500 mx-auto mb-4"></div>
                  <p className="text-gray-500 dark:text-gray-400 text-lg">Loading team data...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
