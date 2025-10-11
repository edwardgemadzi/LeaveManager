'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import TeamCalendar from '@/components/shared/Calendar';
import { Team, User } from '@/types';

export default function MemberCalendarPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await response.json();
        setTeam(data.team);
        setMembers(data.members);
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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Team Calendar</h1>
          <p className="text-lg text-gray-600">View all leave requests for your team.</p>
        </div>

        <div className="bg-white shadow-xl rounded-xl border border-gray-200">
          <div className="px-6 py-8">
            {team?._id ? (
              <TeamCalendar teamId={team._id} members={members} />
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-gray-500 text-lg">Loading team data...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
