'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { Team } from '@/types';

export default function TeamSettingsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    concurrentLeave: 2,
    maxLeavePerYear: 20,
    minimumNoticePeriod: 1,
  });

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) {
          console.error('Settings - Failed to fetch team data:', response.status, response.statusText);
          const errorData = await response.json();
          console.error('Settings - Error details:', errorData);
          return;
        }
        
        const data = await response.json();
        console.log('Settings - Team data received:', data);
        setTeam(data.team);
        setSettings(data.team?.settings || { concurrentLeave: 2, maxLeavePerYear: 20, minimumNoticePeriod: 1 });
      } catch (error) {
        console.error('Error fetching team:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeam();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/team', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        alert('Settings saved successfully!');
      } else {
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

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
      
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Team Settings</h1>
          <p className="mt-2 text-gray-600">Configure your team&apos;s leave policies.</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <form onSubmit={handleSave} className="px-4 py-5 sm:p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Leave Policies</h3>
                
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label htmlFor="concurrentLeave" className="block text-sm font-medium text-gray-700">
                      Maximum Concurrent Leave
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        id="concurrentLeave"
                        min="1"
                        max="10"
                        value={settings.concurrentLeave}
                        onChange={(e) => setSettings({
                          ...settings,
                          concurrentLeave: parseInt(e.target.value)
                        })}
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      Maximum number of team members who can be on leave at the same time.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="maxLeavePerYear" className="block text-sm font-medium text-gray-700">
                      Maximum Leave Days Per Year
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        id="maxLeavePerYear"
                        min="1"
                        max="50"
                        value={settings.maxLeavePerYear}
                        onChange={(e) => setSettings({
                          ...settings,
                          maxLeavePerYear: parseInt(e.target.value)
                        })}
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      Maximum number of leave days each team member can take per year.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="minimumNoticePeriod" className="block text-sm font-medium text-gray-700">
                      Minimum Notice Period (Days)
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        id="minimumNoticePeriod"
                        min="0"
                        max="30"
                        value={settings.minimumNoticePeriod}
                        onChange={(e) => setSettings({
                          ...settings,
                          minimumNoticePeriod: parseInt(e.target.value)
                        })}
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm text-gray-900 bg-white border border-gray-300 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      Minimum number of days in advance that leave requests must be submitted. Set to 0 to allow same-day requests.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Team Information</h3>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team Name</label>
                    <p className="mt-1 text-sm text-gray-900">{team?.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team Username</label>
                    <p className="mt-1 text-sm text-gray-900">{team?.teamUsername}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Share this with team members so they can join your team.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
