'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import TeamCalendar from '@/components/shared/Calendar';
import { Team, User, LeaveRequest } from '@/types';
import { useTeamEvents } from '@/hooks/useTeamEvents';

export default function MemberCalendarPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Fetch team and requests in parallel
        const [teamResponse, requestsResponse] = await Promise.all([
          fetch('/api/team', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
          fetch(`/api/leave-requests?teamId=${userData.teamId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
        ]);

        // Process team response
        const data = await teamResponse.json();
        setTeam(data.team);
        
        // Update user with fresh data from server
        if (data.currentUser) {
          setUser(data.currentUser);
        } else {
          setUser(userData);
        }
        
        // Process requests response first
        const requestsData = await requestsResponse.json();
        setRequests(requestsData);

        // If subgrouping is enabled, filter members by subgroup
        // IMPORTANT: Include ALL members from the same subgroup, not just those with requests
        // This ensures that when requests are processed, all necessary member data is available
        if (data.team?.settings?.enableSubgrouping && data.currentUser) {
          const userSubgroup = data.currentUser.subgroupTag || 'Ungrouped';
          
          // Get all userIds from the requests to ensure we include all members whose requests are shown
          const requestUserIds = new Set(requestsData.map((req: LeaveRequest) => req.userId));
          
          const filteredMembers = data.members.filter((member: User) => {
            // Always include the current user
            if (member._id === data.currentUser._id) return true;
            // Include ALL members from the same subgroup (requests are already filtered by subgroup)
            const memberSubgroup = member.subgroupTag || 'Ungrouped';
            if (memberSubgroup === userSubgroup) return true;
            // Also include members whose requests are in the filtered requests (catch-all for edge cases)
            if (member._id && requestUserIds.has(member._id)) return true;
            return false;
          });
          setMembers(filteredMembers);
        } else {
          // No subgrouping - show all members
          setMembers(data.members);
        }
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
      if (event.type === 'leaveRequestCreated' || event.type === 'leaveRequestUpdated' || event.type === 'leaveRequestDeleted') {
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

        <div className="card rounded-none relative z-10">
          <div className="px-6 py-8 relative z-10">
            {team?._id ? (
              <TeamCalendar 
                teamId={team._id} 
                members={members} 
                currentUser={user || undefined}
                teamSettings={team?.settings ? { 
                  minimumNoticePeriod: team.settings.minimumNoticePeriod || 1,
                  maternityLeave: team.settings.maternityLeave,
                  paternityLeave: team.settings.paternityLeave
                } : undefined}
                initialRequests={requests}
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
