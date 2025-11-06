'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ShiftScheduleBuilder from '@/components/ShiftScheduleBuilder';
import { User, ShiftSchedule, Team } from '@/types';
import { getWorkingDaysGroupDisplayName, getWorkingDaysGroupDisplayNameWithTag } from '@/lib/helpers';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';
import { useNotification } from '@/hooks/useNotification';

export default function LeaderMembersPage() {
  const { showSuccess, showError } = useNotification();
  const [members, setMembers] = useState<User[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [tempSchedule, setTempSchedule] = useState<ShiftSchedule | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [passwordResetModal, setPasswordResetModal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  
  // Group name management
  const [editingGroupNames, setEditingGroupNames] = useState<Record<string, string>>({});
  const [savingGroupNames, setSavingGroupNames] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShiftTag, setFilterShiftTag] = useState<string>('');
  const [filterWorkingDaysTag, setFilterWorkingDaysTag] = useState<string>('');
  const [filterSubgroup, setFilterSubgroup] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'joinDate'>('name');

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) {
          console.error('Failed to fetch team data:', response.status, response.statusText);
          return;
        }
        
        const data = await response.json();
        setMembers(data.members || []);
        setTeam(data.team || null);
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the team? This action cannot be undone.`)) {
      return;
    }

    setDeleting(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setMembers(members.filter(member => member._id !== memberId));
        showSuccess(`${memberName} has been removed from the team.`);
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      showError('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleUpdateShiftTag = async (memberId: string, newShiftTag: 'day' | 'night' | 'mixed') => {
    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftTag: newShiftTag }),
      });

      if (response.ok) {
        setMembers(members.map(member => 
          member._id === memberId 
            ? { ...member, shiftTag: newShiftTag }
            : member
        ));
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to update shift tag');
      }
    } catch (error) {
      console.error('Error updating shift tag:', error);
      showError('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateSubgroup = async (memberId: string, newSubgroupTag: string) => {
    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subgroupTag: newSubgroupTag.trim() || undefined }),
      });

      if (response.ok) {
        setMembers(members.map(member => 
          member._id === memberId 
            ? { ...member, subgroupTag: newSubgroupTag.trim() || undefined }
            : member
        ));
      } else {
        const errorData = await response.json();
        console.error('Error updating subgroup:', errorData);
        showError(errorData.error || 'Failed to update subgroup');
      }
    } catch (error) {
      console.error('Error updating subgroup:', error);
      showError('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateMaternityPaternityType = async (memberId: string, newType: 'maternity' | 'paternity' | null) => {
    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ maternityPaternityType: newType }),
      });

      if (response.ok) {
        setMembers(members.map(member => 
          member._id === memberId 
            ? { ...member, maternityPaternityType: newType }
            : member
        ));
        showSuccess('Maternity/Paternity type updated successfully');
      } else {
        const errorData = await response.json();
        console.error('Error updating maternity/paternity type:', errorData);
        showError(errorData.error || 'Failed to update maternity/paternity type');
      }
    } catch (error) {
      console.error('Error updating maternity/paternity type:', error);
      showError('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleEditSchedule = (member: User) => {
    setEditingSchedule(member._id!);
    setTempSchedule(member.shiftSchedule || {
      pattern: [true, true, true, true, true, false, false],
      startDate: new Date(),
      type: 'rotating'
    });
  };

  const handleSaveSchedule = async (memberId: string) => {
    if (!tempSchedule) return;

    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}/schedule`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftSchedule: tempSchedule }),
      });

      if (response.ok) {
        // Refetch team data to get updated workingDaysTag
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (teamResponse.ok) {
          const data = await teamResponse.json();
          setMembers(data.members || []);
        }
        
        setEditingSchedule(null);
        setTempSchedule(null);
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to update shift schedule');
      }
    } catch (error) {
      console.error('Error updating shift schedule:', error);
      showError('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingSchedule(null);
    setTempSchedule(null);
  };

  const handleOpenPasswordReset = (memberId: string) => {
    setPasswordResetModal(memberId);
    setNewPassword('');
  };

  const handleClosePasswordReset = () => {
    setPasswordResetModal(null);
    setNewPassword('');
  };

  const handleResetPassword = async (memberId: string) => {
    if (!newPassword || newPassword.trim().length < 6) {
      showError('Password must be at least 6 characters long');
      return;
    }

    setResettingPassword(memberId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });

      if (response.ok) {
        showSuccess('Password reset successfully');
        handleClosePasswordReset();
      } else {
        const errorData = await response.json();
        console.error('Error resetting password:', errorData);
        showError(errorData.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      showError('Network error. Please try again.');
    } finally {
      setResettingPassword(null);
    }
  };

  const getShiftTagColor = (shiftTag?: string) => {
    switch (shiftTag) {
      case 'day': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
      case 'night': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400';
      case 'mixed': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400';
      default: return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300';
    }
  };

  const getShiftTagIcon = (shiftTag?: string) => {
    switch (shiftTag) {
      case 'day': return '☀️';
      case 'night': return '🌙';
      case 'mixed': return '🔄';
      default: return '❓';
    }
  };

  // Get unique values for filter dropdowns with member counts
  // Include both stored tags (fixed schedules) and generated tags (rotating schedules)
  // This ensures all patterns that appear in analytics are included for renaming
  const workingDaysTagsWithCounts = members
    .filter(m => m.shiftSchedule) // Only include members with schedules
    .reduce((acc, m) => {
      // For fixed schedules, use stored tag or generate if missing
      // For rotating schedules, always generate (matches analytics behavior)
      const tag = m.shiftSchedule?.type === 'rotating'
        ? generateWorkingDaysTag(m.shiftSchedule)
        : (m.workingDaysTag || generateWorkingDaysTag(m.shiftSchedule));
      
      if (tag && tag !== 'no-schedule') {
        acc[tag] = (acc[tag] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
  
  const uniqueWorkingDaysTags = Object.keys(workingDaysTagsWithCounts).sort();

  const uniqueSubgroups = team?.settings.enableSubgrouping && team?.settings.subgroups
    ? Array.from(new Set([...team.settings.subgroups, 'Ungrouped']))
    : [];

  // Filter and sort members
  const filteredAndSortedMembers = members
    .filter((member) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = (member.fullName || '').toLowerCase().includes(query);
        const matchesUsername = member.username.toLowerCase().includes(query);
        if (!matchesName && !matchesUsername) return false;
      }

      // Shift tag filter
      if (filterShiftTag) {
        // Special handling for "unassigned" - check for empty string or undefined
        if (filterShiftTag === '__UNASSIGNED__') {
          if (member.shiftTag) return false;
        } else {
          if (member.shiftTag !== filterShiftTag) return false;
        }
      }

      // Working days tag filter (for both fixed and rotating schedules)
      if (filterWorkingDaysTag) {
        // Generate tag for rotating schedules, use stored tag for fixed
        const memberTag = member.shiftSchedule?.type === 'rotating'
          ? generateWorkingDaysTag(member.shiftSchedule)
          : (member.workingDaysTag || (member.shiftSchedule ? generateWorkingDaysTag(member.shiftSchedule) : undefined));
        
        if (memberTag !== filterWorkingDaysTag) return false;
      }

      // Subgroup filter
      if (filterSubgroup) {
        if (filterSubgroup === 'Ungrouped') {
          if (member.subgroupTag) return false;
        } else {
          if (member.subgroupTag !== filterSubgroup) return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = (a.fullName || a.username).toLowerCase();
        const nameB = (b.fullName || b.username).toLowerCase();
        return nameA.localeCompare(nameB);
      } else {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // Newest first
      }
    });

  const hasActiveFilters = searchQuery || filterShiftTag || filterWorkingDaysTag || filterSubgroup;

  const clearFilters = () => {
    setSearchQuery('');
    setFilterShiftTag('');
    setFilterWorkingDaysTag('');
    setFilterSubgroup('');
  };

  // Handle group name editing
  const handleGroupNameChange = (tag: string, value: string) => {
    setEditingGroupNames(prev => ({
      ...prev,
      [tag]: value,
    }));
  };

  const handleSaveGroupNames = async () => {
    setSavingGroupNames(true);
    try {
      const token = localStorage.getItem('token');
      
      // Start with existing group names from team settings
      const existingNames = team?.settings.workingDaysGroupNames || {};
      const updatedNames = { ...existingNames };
      
      // Apply all edits (including empty strings to remove names)
      for (const [tag, name] of Object.entries(editingGroupNames)) {
        const trimmedName = name.trim();
        if (trimmedName) {
          updatedNames[tag] = trimmedName;
        } else {
          // Remove the name if it's empty
          delete updatedNames[tag];
        }
      }
      
      // Only update if there are changes
      const hasChanges = JSON.stringify(existingNames) !== JSON.stringify(updatedNames);
      
      if (!hasChanges) {
        setSavingGroupNames(false);
        return;
      }
      
      // Fetch current team settings first to merge properly
      const currentResponse = await fetch('/api/team', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!currentResponse.ok) {
        throw new Error('Failed to fetch current settings');
      }
      
      const currentData = await currentResponse.json();
      const currentSettings = currentData.team?.settings || {};
      
      // Update settings with new group names
      const response = await fetch('/api/team', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: {
            ...currentSettings,
            workingDaysGroupNames: updatedNames,
          },
        }),
      });
      
      if (response.ok) {
        // Refresh team data
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (teamResponse.ok) {
          const data = await teamResponse.json();
          setTeam(data.team);
          setEditingGroupNames({});
          showSuccess('Group names saved successfully!');
        }
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to save group names');
      }
    } catch (error) {
      console.error('Error saving group names:', error);
      showError('Network error. Please try again.');
    } finally {
      setSavingGroupNames(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading team members...</p>
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
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Team Members</h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Manage your team members and their shift assignments</p>
        </div>

        <div className="card">
          <div className="p-5 sm:p-6">
            {/* Filter Section */}
            {members.length > 0 && (
              <div className="mb-6 space-y-4 border-b border-gray-200 dark:border-gray-800 pb-4">
                {/* Search and Quick Filters Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Search Input */}
                  <div>
                    <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Search
                    </label>
                    <input
                      type="text"
                      id="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or username..."
                      className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                    />
                  </div>

                  {/* Shift Tag Filter */}
                  <div>
                    <label htmlFor="shift-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Shift Tag
                    </label>
                    <select
                      id="shift-filter"
                      value={filterShiftTag}
                      onChange={(e) => setFilterShiftTag(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                    >
                      <option value="">All Shifts</option>
                      <option value="day">☀️ Day Shift</option>
                      <option value="night">🌙 Night Shift</option>
                      <option value="mixed">🔄 Mixed Shifts</option>
                      <option value="__UNASSIGNED__">❓ Unassigned</option>
                    </select>
                  </div>
                </div>

                {/* Secondary Filters Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Working Days Tag Filter */}
                  {uniqueWorkingDaysTags.length > 0 && (
                    <div>
                      <label htmlFor="working-days-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Working Days Pattern
                      </label>
                      <select
                        id="working-days-filter"
                        value={filterWorkingDaysTag}
                        onChange={(e) => setFilterWorkingDaysTag(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                      >
                        <option value="">All Patterns</option>
                        {uniqueWorkingDaysTags
                          .map(tag => ({
                            tag,
                            displayName: getWorkingDaysGroupDisplayNameWithTag(tag, team?.settings),
                            customName: team?.settings?.workingDaysGroupNames?.[tag],
                            count: workingDaysTagsWithCounts[tag] || 0,
                          }))
                          .sort((a, b) => {
                            // Sort by custom name first, then by tag
                            const nameA = a.customName || a.tag;
                            const nameB = b.customName || b.tag;
                            return nameA.localeCompare(nameB);
                          })
                          .map(({ tag, displayName, count }) => (
                            <option key={tag} value={tag}>
                              {displayName} ({count} {count === 1 ? 'member' : 'members'})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Subgroup Filter */}
                  {uniqueSubgroups.length > 0 && (
                    <div>
                      <label htmlFor="subgroup-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Subgroup
                      </label>
                      <select
                        id="subgroup-filter"
                        value={filterSubgroup}
                        onChange={(e) => setFilterSubgroup(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                      >
                        <option value="">All Subgroups</option>
                        {uniqueSubgroups.map((subgroup) => (
                          <option key={subgroup} value={subgroup}>
                            {subgroup}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Sort By */}
                  <div>
                    <label htmlFor="sort-by" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sort By
                    </label>
                    <select
                      id="sort-by"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'name' | 'joinDate')}
                      className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                    >
                      <option value="name">Name (A-Z)</option>
                      <option value="joinDate">Join Date (Newest First)</option>
                    </select>
                  </div>
                </div>

                {/* Filter Summary and Clear Button */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Showing <span className="font-medium">{filteredAndSortedMembers.length}</span> of{' '}
                    <span className="font-medium">{members.length}</span> member{members.length !== 1 ? 's' : ''}
                    {hasActiveFilters && (
                      <span className="ml-2 text-gray-500 dark:text-gray-400">(filtered)</span>
                    )}
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Working Days Group Names Management Section */}
            {members.length > 0 && uniqueWorkingDaysTags.length > 0 && (
              <div className="mb-6 border-t border-gray-200 dark:border-gray-800 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Working Days Group Names</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Assign custom names to groups of members who work on the same days pattern.
                    </p>
                  </div>
                  {Object.keys(editingGroupNames).length > 0 && (
                    <button
                      onClick={handleSaveGroupNames}
                      disabled={savingGroupNames}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingGroupNames ? 'Saving...' : 'Save Names'}
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uniqueWorkingDaysTags.map((tag) => {
                    const memberCount = workingDaysTagsWithCounts[tag] || 0;
                    const currentName = team?.settings?.workingDaysGroupNames?.[tag] || '';
                    const editingName = editingGroupNames[tag] !== undefined 
                      ? editingGroupNames[tag] 
                      : currentName;
                    const hasChanges = editingName !== currentName;
                    
                    return (
                      <div key={tag} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{tag}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({memberCount} {memberCount === 1 ? 'member' : 'members'})
                              </span>
                            </div>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => handleGroupNameChange(tag, e.target.value)}
                              placeholder="Enter group name..."
                              className={`w-full text-sm border rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 ${
                                hasChanges ? 'border-indigo-400 dark:border-indigo-500' : 'border-gray-300 dark:border-gray-700'
                              }`}
                            />
                            {currentName && !hasChanges && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ {currentName}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {Object.keys(editingGroupNames).length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Click on any input above to start editing group names. Changes will be saved for all members with that pattern.
                  </p>
                )}
              </div>
            )}

            {members.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No team members found.</p>
            ) : filteredAndSortedMembers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No members match your filters.</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                  >
                    Clear filters to see all members
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAndSortedMembers.map((member) => (
                  <div key={member._id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-white dark:bg-gray-900">
                    <div className="space-y-4">
                      {/* Header Section */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-3 sm:space-y-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                              {member.fullName || member.username}
                            </h4>
                            {member.role !== 'leader' && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getShiftTagColor(member.shiftTag)}`}>
                                {getShiftTagIcon(member.shiftTag)} {member.shiftTag || 'Unassigned'}
                              </span>
                            )}
                            {member.role === 'leader' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                👑 Leader
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Username: {member.username}
                          </p>
                          {member.shiftSchedule && (() => {
                            // Generate tag for both fixed (stored) and rotating (dynamic) schedules
                            const workingDaysTag = member.shiftSchedule.type === 'rotating'
                              ? generateWorkingDaysTag(member.shiftSchedule)
                              : (member.workingDaysTag || generateWorkingDaysTag(member.shiftSchedule));
                            
                            if (workingDaysTag && workingDaysTag !== 'no-schedule') {
                              return (
                            <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">Working Days:</span>
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                    {getWorkingDaysGroupDisplayName(workingDaysTag, team?.settings)}
                                    {team?.settings?.workingDaysGroupNames?.[workingDaysTag] && (
                                      <span className="ml-1 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
                                        ({workingDaysTag.substring(0, 6)}{workingDaysTag.length > 6 ? '...' : ''})
                                      </span>
                                    )}
                              </span>
                            </div>
                              );
                            }
                            return null;
                          })()}
                          {team?.settings.enableSubgrouping && member.subgroupTag && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Subgroup:</span>
                              <span className="text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded">
                                {member.subgroupTag}
                              </span>
                            </div>
                          )}
                          {team?.settings.enableSubgrouping && !member.subgroupTag && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Subgroup:</span>
                              <span className="text-xs font-medium bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                                Ungrouped
                              </span>
                            </div>
                          )}
                          {member.maternityPaternityType && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Parental Leave:</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                member.maternityPaternityType === 'maternity'
                                  ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                                  : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              }`}>
                                {member.maternityPaternityType === 'maternity' ? '🤱 Maternity' : '👨‍👩‍👧 Paternity'}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Joined: {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Unknown'}
                          </p>
                        </div>
                        
                        {/* Action Buttons - Only for members */}
                        {member.role !== 'leader' && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                            {/* Shift Tag Selector */}
                            <div className="flex items-center space-x-2">
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Shift:</label>
                              <select
                                value={member.shiftTag || ''}
                                onChange={(e) => handleUpdateShiftTag(member._id!, e.target.value as 'day' | 'night' | 'mixed')}
                                disabled={updating === member._id}
                                className="text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50 min-w-0 flex-1"
                              >
                                <option value="">Select shift</option>
                                <option value="day">☀️ Day Shift</option>
                                <option value="night">🌙 Night Shift</option>
                                <option value="mixed">🔄 Mixed Shifts</option>
                              </select>
                            </div>
                            
                            {/* Maternity/Paternity Type Selector - Always available */}
                            <div className="flex items-center space-x-2">
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Parental:</label>
                              <select
                                value={member.maternityPaternityType || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  handleUpdateMaternityPaternityType(member._id!, value === '' ? null : value as 'maternity' | 'paternity');
                                }}
                                disabled={updating === member._id}
                                className="text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50 min-w-0 flex-1"
                              >
                                <option value="">None</option>
                                <option value="maternity">🤱 Maternity</option>
                                <option value="paternity">👨‍👩‍👧 Paternity</option>
                              </select>
                            </div>
                            
                            {/* Password Reset Button */}
                            <button
                              onClick={() => handleOpenPasswordReset(member._id!)}
                              disabled={resettingPassword === member._id}
                              className="bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              🔑 Reset Password
                            </button>
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteMember(member._id!, member.fullName || member.username)}
                              disabled={deleting === member._id}
                              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {deleting === member._id ? 'Removing...' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Subgroup Section - Only for members when subgrouping is enabled */}
                      {member.role !== 'leader' && team?.settings.enableSubgrouping && team?.settings.subgroups && team.settings.subgroups.length >= 2 && (
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Subgroup:</label>
                            <select
                              value={member.subgroupTag || ''}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                // Update local state immediately for better UX
                                setMembers(members.map(m => 
                                  m._id === member._id 
                                    ? { ...member, subgroupTag: newValue || undefined }
                                    : m
                                ));
                                // Save immediately on change
                                handleUpdateSubgroup(member._id!, newValue);
                              }}
                              disabled={updating === member._id}
                              className="text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50 flex-1 max-w-xs"
                            >
                              <option value="">Ungrouped</option>
                              {team.settings.subgroups.map((subgroupName) => (
                                <option key={subgroupName} value={subgroupName}>
                                  {subgroupName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Members in the same subgroup share concurrent leave limits and analytics.
                          </p>
                        </div>
                      )}

                      {/* Schedule Section - Only for members */}
                      {member.role !== 'leader' && (
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                          {editingSchedule === member._id ? (
                            <div className="space-y-3">
                              <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Edit Shift Schedule</h5>
                                <ShiftScheduleBuilder 
                                  onScheduleChange={setTempSchedule}
                                  initialSchedule={tempSchedule || undefined}
                                  teamSettings={team?.settings}
                                  members={members}
                                />
                              </div>
                              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                <button
                                  onClick={() => handleSaveSchedule(member._id!)}
                                  disabled={updating === member._id}
                                  className="bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                  {updating === member._id ? 'Saving...' : 'Save Schedule'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Schedule: {member.shiftSchedule?.type === 'rotating' ? 'Rotating' : 'Fixed'} 
                                {member.shiftSchedule?.pattern && (
                                  <span className="ml-2">
                                    ({member.shiftSchedule.pattern.map(day => day ? 'W' : 'O').join('')})
                                  </span>
                                )}
                              </p>
                              <button
                                onClick={() => handleEditSchedule(member)}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium self-start"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Shift Information */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">💡 Shift Tag Information</h3>
          <div className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
            <p><strong>☀️ Day Shift:</strong> Members who primarily work during day hours</p>
            <p><strong>🌙 Night Shift:</strong> Members who primarily work during night hours</p>
            <p><strong>🔄 Mixed Shifts:</strong> Members who work both day and night shifts</p>
            <p className="mt-2 text-blue-700 dark:text-blue-400">
              <strong>Note:</strong> Shift tags help with concurrent leave management - members with different shift tags can take leave simultaneously without affecting coverage. Team leaders don&apos;t need shift tags as they manage the team.
            </p>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {passwordResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Reset Password
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter a new password for this member. The password must be at least 6 characters long.
            </p>
            <div className="mb-4">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password..."
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleResetPassword(passwordResetModal);
                  } else if (e.key === 'Escape') {
                    handleClosePasswordReset();
                  }
                }}
              />
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 sm:justify-end">
              <button
                onClick={handleClosePasswordReset}
                disabled={resettingPassword === passwordResetModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetPassword(passwordResetModal)}
                disabled={resettingPassword === passwordResetModal || !newPassword || newPassword.trim().length < 6}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resettingPassword === passwordResetModal ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
