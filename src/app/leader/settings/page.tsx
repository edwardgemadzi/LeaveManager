'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { Team } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatDateSafe, parseDateSafe } from '@/lib/dateUtils';

export default function TeamSettingsPage() {
  const { showSuccess } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    concurrentLeave: 2,
    maxLeavePerYear: 20,
    minimumNoticePeriod: 1,
    allowCarryover: false,
    carryoverSettings: {
      limitedToMonths: [] as number[],
      maxCarryoverDays: undefined as number | undefined,
      expiryDate: undefined as string | undefined,
    },
    enableSubgrouping: false,
    subgroups: [] as string[],
    workingDaysGroupNames: {} as Record<string, string>,
    bypassNoticePeriod: {
      enabled: false,
      startDate: undefined as string | undefined,
      endDate: undefined as string | undefined,
    },
    maternityLeave: {
      enabled: false,
      maxDays: 90,
      countingMethod: 'working' as 'calendar' | 'working',
    },
    paternityLeave: {
      enabled: false,
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
          carryoverSettings: {
            limitedToMonths: [] as number[],
            maxCarryoverDays: undefined as number | undefined,
            expiryDate: undefined as string | undefined,
          },
          enableSubgrouping: false,
          subgroups: [] as string[],
          workingDaysGroupNames: {} as Record<string, string>,
          bypassNoticePeriod: {
            enabled: false,
            startDate: undefined as string | undefined,
            endDate: undefined as string | undefined,
          },
          maternityLeave: {
            enabled: false,
            maxDays: 90,
            countingMethod: 'working' as 'calendar' | 'working',
          },
          paternityLeave: {
            enabled: false,
            maxDays: 90,
            countingMethod: 'working' as 'calendar' | 'working',
          },
        };
        const teamSettings = data.team?.settings || defaultSettings;
        // Convert carryover expiry date from Date object to ISO string for input field
        if (teamSettings.carryoverSettings?.expiryDate) {
          teamSettings.carryoverSettings.expiryDate = typeof teamSettings.carryoverSettings.expiryDate === 'string' 
            ? teamSettings.carryoverSettings.expiryDate.split('T')[0]
            : formatDateSafe(parseDateSafe(teamSettings.carryoverSettings.expiryDate));
        }
        // Convert bypass dates from Date objects to ISO strings for input fields
        if (teamSettings.bypassNoticePeriod?.startDate) {
          teamSettings.bypassNoticePeriod.startDate = typeof teamSettings.bypassNoticePeriod.startDate === 'string' 
            ? teamSettings.bypassNoticePeriod.startDate.split('T')[0]
            : formatDateSafe(parseDateSafe(teamSettings.bypassNoticePeriod.startDate));
        }
        if (teamSettings.bypassNoticePeriod?.endDate) {
          teamSettings.bypassNoticePeriod.endDate = typeof teamSettings.bypassNoticePeriod.endDate === 'string'
            ? teamSettings.bypassNoticePeriod.endDate.split('T')[0]
            : formatDateSafe(parseDateSafe(teamSettings.bypassNoticePeriod.endDate));
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
      const startDate = parseDateSafe(settings.bypassNoticePeriod.startDate);
      const endDate = parseDateSafe(settings.bypassNoticePeriod.endDate);
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
        const responseData = await response.json();
        console.log('[Settings] Save response:', responseData);
        
        // Verify the settings were saved correctly from the response
        const savedSettings = responseData.settings;
        if (savedSettings) {
          console.log('[Settings] Settings saved to database:', {
            concurrentLeave: savedSettings.concurrentLeave,
            maxLeavePerYear: savedSettings.maxLeavePerYear,
            minimumNoticePeriod: savedSettings.minimumNoticePeriod
          });
        }
        
        showSuccess('Settings saved successfully!');
        
        // Wait a moment to ensure database write completes and is committed
        // Increased delay to ensure MongoDB write is fully committed before other pages refetch
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Refresh team data to get updated settings
        const teamResponse = await fetch(`/api/team?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          cache: 'no-store',
        });
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          console.log('[Settings] Team data fetched after save. Concurrent leave:', teamData.team?.settings?.concurrentLeave);
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
              : formatDateSafe(parseDateSafe(teamSettings.bypassNoticePeriod.startDate));
          }
          if (teamSettings.bypassNoticePeriod?.endDate) {
            teamSettings.bypassNoticePeriod.endDate = typeof teamSettings.bypassNoticePeriod.endDate === 'string'
              ? teamSettings.bypassNoticePeriod.endDate.split('T')[0]
              : formatDateSafe(parseDateSafe(teamSettings.bypassNoticePeriod.endDate));
          }
          setSettings(teamSettings);
          
          // Dispatch event to notify other pages that settings have been updated
          // Include the actual concurrent leave value in the event for debugging
          const eventDetail = { concurrentLeave: teamSettings.concurrentLeave };
          console.log('[Settings] Dispatching teamSettingsUpdated event with concurrentLeave:', teamSettings.concurrentLeave);
          window.dispatchEvent(new CustomEvent('teamSettingsUpdated', { detail: eventDetail }));
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
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Navbar />
      
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12 max-w-4xl mx-auto">
        {/* Header Section - Enhanced */}
        <div className="mb-8 fade-in">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Team Settings</h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Configure your team&apos;s leave policies</p>
        </div>

        <div className="card">
          <form onSubmit={handleSave} className="p-5 sm:p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Leave Policies</h3>
                
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label htmlFor="concurrentLeave" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Maximum Concurrent Leave
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const current = settings.concurrentLeave ?? 2;
                          if (current > 1) {
                            setSettings({
                              ...settings,
                              concurrentLeave: current - 1
                            });
                          }
                        }}
                        disabled={settings.concurrentLeave <= 1}
                        className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Decrease"
                      >
                        <MinusIcon className="h-5 w-5" />
                      </button>
                      <input
                        type="number"
                        id="concurrentLeave"
                        min="1"
                        max="10"
                        value={settings.concurrentLeave ?? 2}
                        readOnly
                        className="input-modern text-center w-20"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const current = settings.concurrentLeave ?? 2;
                          if (current < 10) {
                            setSettings({
                              ...settings,
                              concurrentLeave: current + 1
                            });
                          }
                        }}
                        disabled={settings.concurrentLeave >= 10}
                        className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Increase"
                      >
                        <PlusIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Maximum number of team members who can be on leave at the same time.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="maxLeavePerYear" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Maximum Leave Days Per Year
                    </label>
                    <div>
                      <input
                        type="number"
                        id="maxLeavePerYear"
                        min="1"
                        max="50"
                        value={settings.maxLeavePerYear ?? 20}
                        onChange={(e) => {
                          const inputValue = e.target.value.trim();
                          if (inputValue === '') {
                            // Allow clearing the field - don't update state yet
                            e.target.value = '';
                            return;
                          }
                          const value = parseInt(inputValue, 10);
                          if (!isNaN(value) && value >= 1 && value <= 50) {
                            setSettings({
                              ...settings,
                              maxLeavePerYear: value
                            });
                          }
                        }}
                        onBlur={(e) => {
                          const inputValue = e.target.value.trim();
                          if (inputValue === '' || isNaN(parseInt(inputValue, 10))) {
                            setSettings({
                              ...settings,
                              maxLeavePerYear: 20
                            });
                          } else {
                            const value = parseInt(inputValue, 10);
                            if (value >= 1 && value <= 50) {
                              setSettings({
                                ...settings,
                                maxLeavePerYear: value
                              });
                            } else {
                              setSettings({
                                ...settings,
                                maxLeavePerYear: 20
                              });
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          // Allow clearing with Delete/Backspace
                          if (e.key === 'Delete' || e.key === 'Backspace') {
                            const target = e.target as HTMLInputElement;
                            if (target.value && target.selectionStart === 0 && target.selectionEnd === target.value.length) {
                              target.value = '';
                            }
                          }
                        }}
                        className="input-modern w-full"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Maximum number of leave days each team member can take per year.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="minimumNoticePeriod" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Minimum Notice Period (Days)
                    </label>
                    <div>
                      <input
                        type="number"
                        id="minimumNoticePeriod"
                        min="0"
                        max="30"
                        value={settings.minimumNoticePeriod ?? 1}
                        onChange={(e) => {
                          const inputValue = e.target.value.trim();
                          if (inputValue === '') {
                            // Allow clearing the field - don't update state yet
                            e.target.value = '';
                            return;
                          }
                          const value = parseInt(inputValue, 10);
                          if (!isNaN(value) && value >= 0 && value <= 30) {
                            setSettings({
                              ...settings,
                              minimumNoticePeriod: value
                            });
                          }
                        }}
                        onBlur={(e) => {
                          const inputValue = e.target.value.trim();
                          if (inputValue === '' || isNaN(parseInt(inputValue, 10))) {
                            setSettings({
                              ...settings,
                              minimumNoticePeriod: 1
                            });
                          } else {
                            const value = parseInt(inputValue, 10);
                            if (value >= 0 && value <= 30) {
                              setSettings({
                                ...settings,
                                minimumNoticePeriod: value
                              });
                            } else {
                              setSettings({
                                ...settings,
                                minimumNoticePeriod: 1
                              });
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          // Allow clearing with Delete/Backspace
                          if (e.key === 'Delete' || e.key === 'Backspace') {
                            const target = e.target as HTMLInputElement;
                            if (target.value && target.selectionStart === 0 && target.selectionEnd === target.value.length) {
                              target.value = '';
                            }
                          }
                        }}
                        className="input-modern w-full"
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
                                Bypass is currently active from {parseDateSafe(settings.bypassNoticePeriod.startDate).toLocaleDateString()} to {parseDateSafe(settings.bypassNoticePeriod.endDate).toLocaleDateString()}
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
                        allowCarryover: e.target.checked,
                        // Reset carryover settings if disabled
                        carryoverSettings: e.target.checked ? (settings.carryoverSettings || {
                          limitedToMonths: [],
                          maxCarryoverDays: undefined,
                          expiryDate: undefined,
                        }) : {
                          limitedToMonths: [],
                          maxCarryoverDays: undefined,
                          expiryDate: undefined,
                        }
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
                  
                  {/* Carryover Settings */}
                  {settings.allowCarryover && (
                    <div className="mt-4 ml-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                      <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Carryover Customization</h5>
                      
                      {/* Limited to Months */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Limited to Months (optional)
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Select months when carryover days can be used (e.g., January only). Leave empty to allow use anytime.
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
                            <label key={index} className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(settings.carryoverSettings?.limitedToMonths || []).includes(index)}
                                onChange={(e) => {
                                  const currentMonths = settings.carryoverSettings?.limitedToMonths || [];
                                  const newMonths = e.target.checked
                                    ? [...currentMonths, index]
                                    : currentMonths.filter(m => m !== index);
                                  setSettings({
                                    ...settings,
                                    carryoverSettings: {
                                      ...settings.carryoverSettings,
                                      limitedToMonths: newMonths.sort((a, b) => a - b)
                                    }
                                  });
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                              />
                              <span className="text-xs text-gray-700 dark:text-gray-300">{month}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      
                      {/* Max Carryover Days */}
                      <div className="mb-4">
                        <label htmlFor="maxCarryoverDays" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Maximum Carryover Days (optional)
                        </label>
                        <input
                          type="number"
                          id="maxCarryoverDays"
                          min="0"
                          value={settings.carryoverSettings?.maxCarryoverDays || ''}
                          onChange={(e) => setSettings({
                            ...settings,
                            carryoverSettings: {
                              ...settings.carryoverSettings,
                              maxCarryoverDays: e.target.value ? parseInt(e.target.value, 10) : undefined
                            }
                          })}
                          placeholder="No limit"
                          className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Maximum number of days that can carry over. Leave empty for no limit.
                        </p>
                      </div>
                      
                      {/* Expiry Date */}
                      <div>
                        <label htmlFor="carryoverExpiryDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Expiry Date (optional)
                        </label>
                        <input
                          type="date"
                          id="carryoverExpiryDate"
                          value={settings.carryoverSettings?.expiryDate || ''}
                          onChange={(e) => setSettings({
                            ...settings,
                            carryoverSettings: {
                              ...settings.carryoverSettings,
                              expiryDate: e.target.value || undefined
                            }
                          })}
                          className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Date when carryover days expire. Leave empty for no expiry.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Maternity Leave Settings */}
                  <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                    <div className="flex items-center mb-4">
                      <input
                        type="checkbox"
                        id="maternityLeaveEnabled"
                        checked={settings.maternityLeave?.enabled || false}
                        onChange={(e) => setSettings({
                          ...settings,
                          maternityLeave: {
                            ...settings.maternityLeave,
                            enabled: e.target.checked,
                            maxDays: settings.maternityLeave?.maxDays || 90,
                            countingMethod: settings.maternityLeave?.countingMethod || 'working',
                          }
                        })}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                      />
                      <label htmlFor="maternityLeaveEnabled" className="ml-2 block text-md font-medium text-gray-900 dark:text-white">
                        🤱 Enable Maternity Leave
                      </label>
                    </div>
                    <p className="ml-6 mb-4 text-sm text-gray-500 dark:text-gray-400">
                      Allow members to be assigned maternity leave and take maternity leave requests.
                    </p>
                    
                    {settings.maternityLeave?.enabled && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="maternityMaxDays" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Maximum Maternity Leave Days
                        </label>
                        <div>
                          <input
                            type="number"
                            id="maternityMaxDays"
                            min="1"
                            max="365"
                            value={settings.maternityLeave?.maxDays ?? 90}
                            onChange={(e) => {
                              const inputValue = e.target.value.trim();
                              if (inputValue === '') {
                                e.target.value = '';
                                return;
                              }
                              const value = parseInt(inputValue, 10);
                              if (!isNaN(value) && value >= 1 && value <= 365) {
                                setSettings({
                                  ...settings,
                                  maternityLeave: {
                                    ...settings.maternityLeave,
                                    maxDays: value,
                                    countingMethod: settings.maternityLeave?.countingMethod || 'working',
                                  }
                                });
                              }
                            }}
                            onBlur={(e) => {
                              const inputValue = e.target.value.trim();
                              if (inputValue === '' || isNaN(parseInt(inputValue, 10))) {
                                setSettings({
                                  ...settings,
                                  maternityLeave: {
                                    ...settings.maternityLeave,
                                    maxDays: 90,
                                    countingMethod: settings.maternityLeave?.countingMethod || 'working',
                                  }
                                });
                              } else {
                                const value = parseInt(inputValue, 10);
                                if (value >= 1 && value <= 365) {
                                  setSettings({
                                    ...settings,
                                    maternityLeave: {
                                      ...settings.maternityLeave,
                                      maxDays: value,
                                      countingMethod: settings.maternityLeave?.countingMethod || 'working',
                                    }
                                  });
                                } else {
                                  setSettings({
                                    ...settings,
                                    maternityLeave: {
                                      ...settings.maternityLeave,
                                      maxDays: 90,
                                      countingMethod: settings.maternityLeave?.countingMethod || 'working',
                                    }
                                  });
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Delete' || e.key === 'Backspace') {
                                const target = e.target as HTMLInputElement;
                                if (target.value && target.selectionStart === 0 && target.selectionEnd === target.value.length) {
                                  target.value = '';
                                }
                              }
                            }}
                            className="input-modern w-full"
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          Maximum number of maternity leave days members assigned maternity leave can take per year.
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
                              onChange={() => setSettings({
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
                              onChange={() => setSettings({
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
                          Choose how maternity leave days are counted. Working days counts only days when the member is scheduled to work. Calendar days counts all days in the leave period, including weekends and holidays.
                        </p>
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Paternity Leave Settings */}
                  <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                    <div className="flex items-center mb-4">
                      <input
                        type="checkbox"
                        id="paternityLeaveEnabled"
                        checked={settings.paternityLeave?.enabled || false}
                        onChange={(e) => setSettings({
                          ...settings,
                          paternityLeave: {
                            ...settings.paternityLeave,
                            enabled: e.target.checked,
                            maxDays: settings.paternityLeave?.maxDays || 90,
                            countingMethod: settings.paternityLeave?.countingMethod || 'working',
                          }
                        })}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                      />
                      <label htmlFor="paternityLeaveEnabled" className="ml-2 block text-md font-medium text-gray-900 dark:text-white">
                        👨‍👩‍👧 Enable Paternity Leave
                      </label>
                    </div>
                    <p className="ml-6 mb-4 text-sm text-gray-500 dark:text-gray-400">
                      Allow members to be assigned paternity leave and take paternity leave requests.
                    </p>
                    
                    {settings.paternityLeave?.enabled && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="paternityMaxDays" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Maximum Paternity Leave Days
                        </label>
                        <div>
                          <input
                            type="number"
                            id="paternityMaxDays"
                            min="1"
                            max="365"
                            value={settings.paternityLeave?.maxDays ?? 90}
                            onChange={(e) => {
                              const inputValue = e.target.value.trim();
                              if (inputValue === '') {
                                e.target.value = '';
                                return;
                              }
                              const value = parseInt(inputValue, 10);
                              if (!isNaN(value) && value >= 1 && value <= 365) {
                                setSettings({
                                  ...settings,
                                  paternityLeave: {
                                    ...settings.paternityLeave,
                                    maxDays: value,
                                    countingMethod: settings.paternityLeave?.countingMethod || 'working',
                                  }
                                });
                              }
                            }}
                            onBlur={(e) => {
                              const inputValue = e.target.value.trim();
                              if (inputValue === '' || isNaN(parseInt(inputValue, 10))) {
                                setSettings({
                                  ...settings,
                                  paternityLeave: {
                                    ...settings.paternityLeave,
                                    maxDays: 90,
                                    countingMethod: settings.paternityLeave?.countingMethod || 'working',
                                  }
                                });
                              } else {
                                const value = parseInt(inputValue, 10);
                                if (value >= 1 && value <= 365) {
                                  setSettings({
                                    ...settings,
                                    paternityLeave: {
                                      ...settings.paternityLeave,
                                      maxDays: value,
                                      countingMethod: settings.paternityLeave?.countingMethod || 'working',
                                    }
                                  });
                                } else {
                                  setSettings({
                                    ...settings,
                                    paternityLeave: {
                                      ...settings.paternityLeave,
                                      maxDays: 90,
                                      countingMethod: settings.paternityLeave?.countingMethod || 'working',
                                    }
                                  });
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Delete' || e.key === 'Backspace') {
                                const target = e.target as HTMLInputElement;
                                if (target.value && target.selectionStart === 0 && target.selectionEnd === target.value.length) {
                                  target.value = '';
                                }
                              }
                            }}
                            className="input-modern w-full"
                          />
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          Maximum number of paternity leave days members assigned paternity leave can take per year.
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
                              id="paternityCountingWorking"
                              name="paternityCountingMethod"
                              value="working"
                              checked={settings.paternityLeave?.countingMethod === 'working'}
                              onChange={() => setSettings({
                                ...settings,
                                paternityLeave: {
                                  ...settings.paternityLeave,
                                  maxDays: settings.paternityLeave?.maxDays || 90,
                                  countingMethod: 'working',
                                }
                              })}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700"
                            />
                            <label htmlFor="paternityCountingWorking" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                              Working Days (count only working days based on shift schedule)
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="paternityCountingCalendar"
                              name="paternityCountingMethod"
                              value="calendar"
                              checked={settings.paternityLeave?.countingMethod === 'calendar'}
                              onChange={() => setSettings({
                                ...settings,
                                paternityLeave: {
                                  ...settings.paternityLeave,
                                  maxDays: settings.paternityLeave?.maxDays || 90,
                                  countingMethod: 'calendar',
                                }
                              })}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700"
                            />
                            <label htmlFor="paternityCountingCalendar" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                              Calendar Days (count all days, ignores working days)
                            </label>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          Choose how paternity leave days are counted. Working days counts only days when the member is scheduled to work. Calendar days counts all days in the leave period, including weekends and holidays.
                        </p>
                      </div>
                    </div>
                    )}
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
                className="btn-primary ml-3 disabled:opacity-50"
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
