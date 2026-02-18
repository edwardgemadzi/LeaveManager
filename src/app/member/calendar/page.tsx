'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Navbar from '@/components/shared/Navbar';
import TeamCalendar from '@/components/shared/Calendar';
import { Team, User, LeaveRequest } from '@/types';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { useTeamData } from '@/hooks/useTeamData';
import { useRequests } from '@/hooks/useRequests';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { FunnelIcon } from '@heroicons/react/24/outline';

type CalendarFilter = 'all' | 'my-leave' | 'same-working-days';

export default function MemberCalendarPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [allMembers, setAllMembers] = useState<User[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [localUser, setLocalUser] = useState<User | null>(null);

  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: teamData, mutate: mutateTeam, isLoading: teamLoading } = useTeamData({ members: 'full' });
  const { data: requestsData, mutate: mutateRequests, isLoading: requestsLoading } = useRequests({
    fields: ['_id', 'userId', 'startDate', 'endDate', 'reason', 'status', 'createdAt'],
  });

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setLocalUser(userData);
  }, []);

  useEffect(() => {
    const dataTeam = teamData?.team;
    if (dataTeam) {
      setTeam(dataTeam);
    }

    const currentUser = teamData?.currentUser || localUser;
    if (currentUser) {
      setUser(currentUser);
    }

    const requestsList = requestsData || [];
    const membersList = teamData?.members || [];
    setAllRequests(requestsList);
    setAllMembers(membersList);

    if (dataTeam?.settings?.enableSubgrouping && currentUser) {
      const userSubgroup = currentUser.subgroupTag || 'Ungrouped';
      const requestUserIds = new Set(requestsList.map((req: LeaveRequest) => req.userId));
      const filteredMembers = membersList.filter((member: User) => {
        if (member._id === currentUser._id) return true;
        const memberSubgroup = member.subgroupTag || 'Ungrouped';
        if (memberSubgroup === userSubgroup) return true;
        if (member._id && requestUserIds.has(member._id)) return true;
        return false;
      });
      setMembers(filteredMembers);
    } else {
      setMembers(membersList);
    }
  }, [teamData, requestsData, localUser]);

  useEffect(() => {
    setLoading(teamLoading || requestsLoading);
  }, [teamLoading, requestsLoading]);

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
          mutateRequests();
          mutateTeam();
        }, 300);
      }
    },
  });

  // Filter requests based on selected filter
  const filteredRequests = useMemo(() => {
    if (!user || !allRequests.length) return allRequests;
    if (filter === 'all') return allRequests;

    // Get current user's tags
    const userWorkingDaysTag = user.shiftSchedule?.type === 'rotating'
      ? generateWorkingDaysTag(user.shiftSchedule)
      : (user.workingDaysTag || generateWorkingDaysTag(user.shiftSchedule) || 'no-schedule');

    // Create a map of userId -> member for quick lookup
    const memberMap = new Map<string, User>();
    allMembers.forEach(member => {
      if (member._id) {
        memberMap.set(String(member._id), member);
      }
    });

    return allRequests.filter(request => {
      const requestUserId = String(request.userId);
      const requestMember = memberMap.get(requestUserId);

      // My Leave Days - only show current user's requests
      if (filter === 'my-leave') {
        return requestUserId === String(user._id);
      }

      // Same Working Days - show requests from members with same workingDaysTag
      if (filter === 'same-working-days') {
        if (!requestMember) return false;
        const memberWorkingDaysTag = requestMember.shiftSchedule?.type === 'rotating'
          ? generateWorkingDaysTag(requestMember.shiftSchedule)
          : (requestMember.workingDaysTag || generateWorkingDaysTag(requestMember.shiftSchedule) || 'no-schedule');
        return memberWorkingDaysTag === userWorkingDaysTag;
      }

      return true;
    });
  }, [allRequests, filter, user, allMembers]);

  // Update members list based on filtered requests
  const filteredMembers = useMemo(() => {
    if (filter === 'all') return members;
    
    // Get unique user IDs from filtered requests
    const filteredUserIds = new Set(filteredRequests.map(req => String(req.userId)));
    
    // Include all members whose requests are shown, plus the current user
    return members.filter(member => {
      if (member._id && String(member._id) === String(user?._id)) return true;
      if (member._id && filteredUserIds.has(String(member._id))) return true;
      return false;
    });
  }, [members, filteredRequests, filter, user]);

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
                {team?.settings?.enableSubgrouping && user?.subgroupTag 
                  ? `${user.subgroupTag} Calendar`
                  : 'Team Calendar'}
              </h1>
              <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">
                {team?.settings?.enableSubgrouping && user?.subgroupTag
                  ? `View all leave requests for your subgroup`
                  : 'View all leave requests for your team'}
              </p>
            </div>
            
            {/* Filter Dropdown */}
            <div className="flex items-center gap-2">
              <FunnelIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as CalendarFilter)}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent cursor-pointer"
              >
                <option value="all">All Leave Requests</option>
                <option value="my-leave">My Leave Days</option>
                <option value="same-working-days">Same Working Days</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card rounded-none relative z-10">
          <div className="px-6 py-8 relative z-10">
            {team?._id ? (
              <TeamCalendar 
                teamId={team._id} 
                members={filteredMembers} 
                currentUser={user || undefined}
                teamSettings={team?.settings ? { 
                  minimumNoticePeriod: team.settings.minimumNoticePeriod || 1,
                  bypassNoticePeriod: team.settings.bypassNoticePeriod,
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
