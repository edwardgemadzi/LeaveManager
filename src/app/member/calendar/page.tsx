'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
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
  const [selectionSummary, setSelectionSummary] = useState<{ selectionMode: boolean; selectedCount: number; clearSelection?: () => void }>({
    selectionMode: false,
    selectedCount: 0,
  });

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
      <div className="min-h-screen bg-white dark:bg-zinc-950">
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
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      
      <div className="w-full px-0 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
        {/* Page header */}
        <div className="flex items-center justify-between py-5 border-b border-zinc-200 dark:border-zinc-800 mb-6 px-4 sm:px-0">
          <div>
            <h1 className="app-page-heading text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {team?.settings?.enableSubgrouping && user?.subgroupTag
                ? `${user.subgroupTag} Calendar`
                : 'Team Calendar'}
            </h1>
            <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {team?.settings?.enableSubgrouping && user?.subgroupTag
                ? 'Your subgroup leave requests'
                : 'Team leave requests'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as CalendarFilter)}
              className="input-modern py-1.5 text-sm w-auto"
            >
              <option value="all">All</option>
              <option value="my-leave">Mine</option>
              <option value="same-working-days">Same Days</option>
            </select>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-6 min-w-0">
          <div className="lg:col-span-9 min-w-0">
            <div className="card rounded-none sm:rounded-2xl relative z-10 border-x-0 sm:border-x shadow-none sm:shadow min-w-0 overflow-x-hidden">
              <div className="px-0 sm:px-6 py-2 sm:py-8 relative z-10">
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
                    onMemberSelectionChange={setSelectionSummary}
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

          <aside className="hidden lg:block lg:col-span-3">
            <div className="sticky top-14 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Selection</p>
              {selectionSummary.selectionMode && selectionSummary.selectedCount > 0 ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectionSummary.selectedCount} day{selectionSummary.selectedCount === 1 ? '' : 's'} selected
                  </p>
                  <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Submit your leave request for the selected dates.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('lm:calendar:open-request'))}
                      className="btn-primary text-sm justify-center w-full py-2.5"
                    >
                      Request leave
                    </button>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('lm:calendar:clear-selection'))}
                      className="btn-secondary text-sm justify-center w-full py-2.5"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Click dates on the calendar to start selecting leave.
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Quick links</p>
                <div className="mt-2 grid gap-2">
                  <Link href="/member/requests" className="btn-secondary text-sm justify-center">
                    New request
                  </Link>
                  <Link href="/member/analytics" className="btn-secondary text-sm justify-center">
                    Analytics
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Page-level floating “mini cart” (members only) */}
        {user?.role === 'member' && selectionSummary.selectionMode && selectionSummary.selectedCount > 0 ? (
          <div className="fixed bottom-24 right-4 sm:right-6 z-[60] w-[min(380px,calc(100vw-2rem))] lg:hidden">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-2xl">
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Leave selection
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {selectionSummary.selectedCount} day{selectionSummary.selectedCount === 1 ? '' : 's'} selected
                  </p>
                </div>
              </div>
              <div className="px-4 pb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    // Click the existing in-calendar CTA by triggering the request modal via custom event.
                    // We keep logic inside the calendar component; this event is handled there.
                    window.dispatchEvent(new CustomEvent('lm:calendar:open-request'));
                  }}
                  className="flex-1 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow"
                >
                  Request leave
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('lm:calendar:clear-selection'))}
                  className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
