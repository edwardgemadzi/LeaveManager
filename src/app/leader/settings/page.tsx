'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { Team } from '@/types';

export default function TeamSettingsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    concurrentLeave: 2,
    maxLeavePerYear: 20,
    minimumNoticePeriod: 1,
    allowCarryover: false,
    enableSubgrouping: false,
    subgroups: [] as string[],
    workingDaysGroupNames: {} as Record<string, string>,
    bypassNoticePeriod: {
      enabled: false,
      startDate: undefined as string | undefined,
      endDate: undefined as string | undefined,
    },
    maternityLeave: {
      maxDays: 90,
      countingMethod: 'working' as 'calendar' | 'working',
    },
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
        const defaultSettings = {
          concurrentLeave: 2,
          maxLeavePerYear: 20,
          minimumNoticePeriod: 1,
          allowCarryover: false,
          enableSubgrouping: false,
          subgroups: [] as string[],
          workingDaysGroupNames: {} as Record<string, string>,
          bypassNoticePeriod: {
            enabled: false,
            startDate: undefined as string | undefined,
            endDate: undefined as string | undefined,
          },
          maternityLeave: {
            maxDays: 90,
            countingMethod: 'working' as 'calendar' | 'working',
          },
        };
        const teamSettings = data.team?.settings || defaultSettings;
        // Convert bypass dates from Date objects to ISO strings for input fields
        if (teamSettings.bypassNoticePeriod?.startDate) {
          teamSettings.bypassNoticePeriod.startDate = typeof teamSettings.bypassNoticePeriod.startDate === 'string' 
            ? teamSettings.bypassNoticePeriod.startDate.split('T')[0]
            : new Date(teamSettings.bypassNoticePeriod.startDate).toISOString().split('T')[0];
        }
        if (teamSettings.bypassNoticePeriod?.endDate) {
          teamSettings.bypassNoticePeriod.endDate = typeof teamSettings.bypassNoticePeriod.endDate === 'string'
            ? teamSettings.bypassNoticePeriod.endDate.split('T')[0]
            : new Date(teamSettings.bypassNoticePeriod.endDate).toISOString().split('T')[0];
        }
        setSettings(teamSettings);
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
    setError('');

    // Client-side validation
    if (settings.enableSubgrouping) {
      const validSubgroups = (settings.subgroups || []).filter(name => name && name.trim().length > 0);
      if (validSubgroups.length < 2) {
        setError('At least 2 subgroups are required when subgrouping is enabled');
        setSaving(false);
        return;
      }
    }

    // Validate bypass notice period dates
    if (settings.bypassNoticePeriod?.enabled) {
      if (!settings.bypassNoticePeriod.startDate || !settings.bypassNoticePeriod.endDate) {
        setError('Both start date and end date are required when bypass notice period is enabled');
        setSaving(false);
        return;
      }
      const startDate = new Date(settings.bypassNoticePeriod.startDate);
      const endDate = new Date(settings.bypassNoticePeriod.endDate);
      if (endDate < startDate) {
        setError('End date must be on or after start date');
        setSaving(false);
        return;
      }
    }

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
        // Refresh team data to get updated settings
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          setTeam(teamData.team);
          const defaultSettings = {
            concurrentLeave: 2,
            maxLeavePerYear: 20,
            minimumNoticePeriod: 1,
            allowCarryover: false,
            enableSubgrouping: false,
            subgroups: [] as string[],
            bypassNoticePeriod: {
              enabled: false,
              startDate: undefined as string | undefined,
              endDate: undefined as string | undefined,
            },
            maternityLeave: {
              maxDays: 90,
              countingMethod: 'working' as 'calendar' | 'working',
            },
          };
          const teamSettings = teamData.team?.settings || defaultSettings;
          // Convert bypass dates from Date objects to ISO strings for input fields
          if (teamSettings.bypassNoticePeriod?.startDate) {
            teamSettings.bypassNoticePeriod.startDate = typeof teamSettings.bypassNoticePeriod.startDate === 'string' 
              ? teamSettings.bypassNoticePeriod.startDate.split('T')[0]
              : new Date(teamSettings.bypassNoticePeriod.startDate).toISOString().split('T')[0];
          }
          if (teamSettings.bypassNoticePeriod?.endDate) {
            teamSettings.bypassNoticePeriod.endDate = typeof teamSettings.bypassNoticePeriod.endDate === 'string'
              ? teamSettings.bypassNoticePeriod.endDate.split('T')[0]
              : new Date(teamSettings.bypassNoticePeriod.endDate).toISOString().split('T')[0];
          }
          setSettings(teamSettings);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('Error saving settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="animate-spin rounded-full h-32 w-32 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Navbar />
      
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Team Settings</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Configure your team&apos;s leave policies.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 shadow rounded-lg border border-gray-100 dark:border-gray-800">
          <form onSubmit={handleSave} className="px-4 py-5 sm:p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Leave Policies</h3>
                
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label htmlFor="concurrentLeave" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Maximum number of team members who can be on leave at the same time.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="maxLeavePerYear" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Maximum number of leave days each team member can take per year.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="minimumNoticePeriod" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Minimum number of days in advance that leave requests must be submitted. Set to 0 to allow same-day requests.
                    </p>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="bypassNoticePeriodEnabled"
                        checked={settings.bypassNoticePeriod?.enabled || false}
                        onChange={(e) => setSettings({
                          ...settings,
                          bypassNoticePeriod: {
                            ...settings.bypassNoticePeriod,
                            enabled: e.target.checked,
                            startDate: e.target.checked ? settings.bypassNoticePeriod?.startDate : undefined,
                            endDate: e.target.checked ? settings.bypassNoticePeriod?.endDate : undefined,
                          }
                        })}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                      />
                      <label htmlFor="bypassNoticePeriodEnabled" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Bypass Notice Period
                      </label>
                    </div>
                    <p className="mt-1 ml-6 text-sm text-gray-500 dark:text-gray-400">
                      Temporarily allow members to bypass the minimum notice period requirement during a specified date range. This is useful for emergency situations or end-of-year rush periods.
                    </p>
                    
                    {settings.bypassNoticePeriod?.enabled && (
                      <div className="mt-4 ml-6 space-y-4">
                        <div>
                          <label htmlFor="bypassStartDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Start Date
                          </label>
                          <div className="mt-1">
                            <input
                              type="date"
                              id="bypassStartDate"
                              value={settings.bypassNoticePeriod?.startDate || ''}
                              onChange={(e) => setSettings({
                                ...settings,
                                bypassNoticePeriod: {
                                  ...settings.bypassNoticePeriod,
                                  startDate: e.target.value,
                                }
                              })}
                              className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="bypassEndDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            End Date
                          </label>
                          <div className="mt-1">
                            <input
                              type="date"
                              id="bypassEndDate"
                              value={settings.bypassNoticePeriod?.endDate || ''}
                              min={settings.bypassNoticePeriod?.startDate || ''}
                              onChange={(e) => setSettings({
                                ...settings,
                                bypassNoticePeriod: {
                                  ...settings.bypassNoticePeriod,
                                  endDate: e.target.value,
                                }
                              })}
                              className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                            />
                          </div>
                        </div>
                        {settings.bypassNoticePeriod?.startDate && settings.bypassNoticePeriod?.endDate && (() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const startDate = new Date(settings.bypassNoticePeriod.startDate);
                          startDate.setHours(0, 0, 0, 0);
                          const endDate = new Date(settings.bypassNoticePeriod.endDate);
                          endDate.setHours(23, 59, 59, 999);
                          const isActive = today >= startDate && today <= endDate;
                          return isActive && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                              <p className="text-sm text-blue-800 dark:text-blue-400 font-medium">
                                Bypass is currently active from {new Date(settings.bypassNoticePeriod.startDate).toLocaleDateString()} to {new Date(settings.bypassNoticePeriod.endDate).toLocaleDateString()}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="allowCarryover"
                      checked={settings.allowCarryover || false}
                      onChange={(e) => setSettings({
                        ...settings,
                        allowCarryover: e.target.checked
                      })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                    />
                    <label htmlFor="allowCarryover" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Allow Leave Carryover
                    </label>
                  </div>
                  <p className="mt-1 ml-6 text-sm text-gray-500 dark:text-gray-400">
                    If enabled, unused leave days will carry over to the next year. If disabled, unused days will be lost at year end.
                  </p>
                  
                  {/* Maternity Leave Settings */}
                  <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                    <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Maternity/Paternity Leave</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="maternityMaxDays" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Maximum Maternity Leave Days
                        </label>
                        <div className="mt-1">
                          <input
                            type="number"
                            id="maternityMaxDays"
                            min="1"
                            max="365"
                            value={settings.maternityLeave?.maxDays || 90}
                            onChange={(e) => setSettings({
                              ...settings,
                              maternityLeave: {
                                ...settings.maternityLeave,
                                maxDays: parseInt(e.target.value) || 90,
                                countingMethod: settings.maternityLeave?.countingMethod || 'working',
                              }
                            })}
                            className="px-3 py-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 block w-full sm:text-sm text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          Maximum number of maternity/paternity leave days each team member can take per year.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Counting Method
                        </label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="maternityCountingWorking"
                              name="maternityCountingMethod"
                              value="working"
                              checked={settings.maternityLeave?.countingMethod === 'working'}
                              onChange={(e) => setSettings({
                                ...settings,
                                maternityLeave: {
                                  ...settings.maternityLeave,
                                  maxDays: settings.maternityLeave?.maxDays || 90,
                                  countingMethod: 'working',
                                }
                              })}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700"
                            />
                            <label htmlFor="maternityCountingWorking" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                              Working Days (count only working days based on shift schedule)
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="maternityCountingCalendar"
                              name="maternityCountingMethod"
                              value="calendar"
                              checked={settings.maternityLeave?.countingMethod === 'calendar'}
                              onChange={(e) => setSettings({
                                ...settings,
                                maternityLeave: {
                                  ...settings.maternityLeave,
                                  maxDays: settings.maternityLeave?.maxDays || 90,
                                  countingMethod: 'calendar',
                                }
                              })}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700"
                            />
                            <label htmlFor="maternityCountingCalendar" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                              Calendar Days (count all days, ignores working days)
                            </label>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          Choose how maternity/paternity leave days are counted. Working days counts only days when the member is scheduled to work. Calendar days counts all days in the leave period, including weekends and holidays.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center mt-4">
                    <input
                      type="checkbox"
                      id="enableSubgrouping"
                      checked={settings.enableSubgrouping || false}
                      onChange={(e) => {
                        const isEnabled = e.target.checked;
                        setSettings({
                          ...settings,
                          enableSubgrouping: isEnabled,
                          // Initialize with 2 empty subgroups if enabling, or clear if disabling
                          subgroups: isEnabled && (!settings.subgroups || settings.subgroups.length === 0) 
                            ? ['', ''] 
                            : (isEnabled ? settings.subgroups : [])
                        });
                      }}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                    />
                    <label htmlFor="enableSubgrouping" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable Subgrouping
                    </label>
                  </div>
                  <p className="mt-1 ml-6 text-sm text-gray-500 dark:text-gray-400">
                    If enabled, leaders can organize members into custom subgroups. Each subgroup operates independently with separate concurrent leave limits and analytics. Minimum 2 subgroups required.
                  </p>
                  
                  {/* Subgroup Naming Section */}
                  {settings.enableSubgrouping && (
                    <div className="mt-4 ml-6 space-y-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Subgroup Names (Minimum 2 required)
                      </label>
                      <div className="space-y-2">
                        {(settings.subgroups && settings.subgroups.length >= 2 ? settings.subgroups : ['', '']).map((subgroup, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={subgroup || ''}
                              onChange={(e) => {
                                const newSubgroups = [...(settings.subgroups || ['', ''])];
                                newSubgroups[index] = e.target.value; // Don't trim on every keystroke
                                // Ensure we always have at least 2 subgroups
                                while (newSubgroups.length < 2) {
                                  newSubgroups.push('');
                                }
                                setSettings({
                                  ...settings,
                                  subgroups: newSubgroups
                                });
                              }}
                              placeholder={`Subgroup ${index + 1} name`}
                              className="flex-1 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                            />
                            {index >= 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newSubgroups = [...(settings.subgroups || [])];
                                  newSubgroups.splice(index, 1);
                                  // Ensure we always have at least 2 subgroups
                                  while (newSubgroups.length < 2) {
                                    newSubgroups.push('');
                                  }
                                  setSettings({
                                    ...settings,
                                    subgroups: newSubgroups
                                  });
                                }}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setSettings({
                              ...settings,
                              subgroups: [...(settings.subgroups || ['', '']), '']
                            });
                          }}
                          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                        >
                          + Add Another Subgroup
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Members without a subgroup assignment will be treated as &quot;Ungrouped&quot;
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Team Information</h3>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Team Name</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{team?.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Team Username</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{team?.teamUsername}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Share this with team members so they can join your team.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 disabled:opacity-50"
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
