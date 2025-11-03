'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ShiftScheduleBuilder from '@/components/ShiftScheduleBuilder';
import { User, ShiftSchedule, Team } from '@/types';

export default function LeaderMembersPage() {
  const [members, setMembers] = useState<User[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [tempSchedule, setTempSchedule] = useState<ShiftSchedule | null>(null);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShiftTag, setFilterShiftTag] = useState<string>('');
  const [filterWorkingDaysTag, setFilterWorkingDaysTag] = useState<string>('');
  const [filterSubgroup, setFilterSubgroup] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
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
        alert(`${memberName} has been removed from the team.`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Network error. Please try again.');
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
        alert(error.error || 'Failed to update shift tag');
      }
    } catch (error) {
      console.error('Error updating shift tag:', error);
      alert('Network error. Please try again.');
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
        alert(errorData.error || 'Failed to update subgroup');
      }
    } catch (error) {
      console.error('Error updating subgroup:', error);
      alert('Network error. Please try again.');
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
        alert(error.error || 'Failed to update shift schedule');
      }
    } catch (error) {
      console.error('Error updating shift schedule:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingSchedule(null);
    setTempSchedule(null);
  };

  const getShiftTagColor = (shiftTag?: string) => {
    switch (shiftTag) {
      case 'day': return 'bg-yellow-100 text-yellow-800';
      case 'night': return 'bg-purple-100 text-purple-800';
      case 'mixed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
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

  // Get unique values for filter dropdowns
  const uniqueWorkingDaysTags = Array.from(new Set(
    members
      .filter(m => m.workingDaysTag)
      .map(m => m.workingDaysTag!)
      .sort()
  ));

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

      // Role filter
      if (filterRole) {
        if (filterRole === 'leader' && member.role !== 'leader') return false;
        if (filterRole === 'member' && member.role !== 'member') return false;
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

      // Working days tag filter
      if (filterWorkingDaysTag) {
        if (member.workingDaysTag !== filterWorkingDaysTag) return false;
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

  const hasActiveFilters = searchQuery || filterShiftTag || filterWorkingDaysTag || filterSubgroup || filterRole;

  const clearFilters = () => {
    setSearchQuery('');
    setFilterShiftTag('');
    setFilterWorkingDaysTag('');
    setFilterSubgroup('');
    setFilterRole('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-500 text-lg">Loading team members...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Team Members</h1>
          <p className="mt-2 text-gray-600">Manage your team members and their shift assignments.</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {/* Filter Section */}
            {members.length > 0 && (
              <div className="mb-6 space-y-4 border-b border-gray-200 pb-4">
                {/* Search and Quick Filters Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Search Input */}
                  <div className="md:col-span-1">
                    <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                      Search
                    </label>
                    <input
                      type="text"
                      id="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or username..."
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  {/* Role Filter */}
                  <div>
                    <label htmlFor="role-filter" className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    <select
                      id="role-filter"
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">All Roles</option>
                      <option value="leader">👑 Leaders</option>
                      <option value="member">👤 Members</option>
                    </select>
                  </div>

                  {/* Shift Tag Filter */}
                  <div>
                    <label htmlFor="shift-filter" className="block text-sm font-medium text-gray-700 mb-1">
                      Shift Tag
                    </label>
                      <select
                        id="shift-filter"
                        value={filterShiftTag}
                        onChange={(e) => setFilterShiftTag(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
                      <label htmlFor="working-days-filter" className="block text-sm font-medium text-gray-700 mb-1">
                        Working Days Pattern
                      </label>
                      <select
                        id="working-days-filter"
                        value={filterWorkingDaysTag}
                        onChange={(e) => setFilterWorkingDaysTag(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">All Patterns</option>
                        {uniqueWorkingDaysTags.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Subgroup Filter */}
                  {uniqueSubgroups.length > 0 && (
                    <div>
                      <label htmlFor="subgroup-filter" className="block text-sm font-medium text-gray-700 mb-1">
                        Subgroup
                      </label>
                      <select
                        id="subgroup-filter"
                        value={filterSubgroup}
                        onChange={(e) => setFilterSubgroup(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
                    <label htmlFor="sort-by" className="block text-sm font-medium text-gray-700 mb-1">
                      Sort By
                    </label>
                    <select
                      id="sort-by"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'name' | 'joinDate')}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="name">Name (A-Z)</option>
                      <option value="joinDate">Join Date (Newest First)</option>
                    </select>
                  </div>
                </div>

                {/* Filter Summary and Clear Button */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing <span className="font-medium">{filteredAndSortedMembers.length}</span> of{' '}
                    <span className="font-medium">{members.length}</span> member{members.length !== 1 ? 's' : ''}
                    {hasActiveFilters && (
                      <span className="ml-2 text-gray-500">(filtered)</span>
                    )}
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </div>
            )}

            {members.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No team members found.</p>
            ) : filteredAndSortedMembers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No members match your filters.</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Clear filters to see all members
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAndSortedMembers.map((member) => (
                  <div key={member._id} className="border rounded-lg p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                    <div className="space-y-4">
                      {/* Header Section */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-3 sm:space-y-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h4 className="text-lg font-medium text-gray-900">
                              {member.fullName || member.username}
                            </h4>
                            {member.role !== 'leader' && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getShiftTagColor(member.shiftTag)}`}>
                                {getShiftTagIcon(member.shiftTag)} {member.shiftTag || 'Unassigned'}
                              </span>
                            )}
                            {member.role === 'leader' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                👑 Leader
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Username: {member.username}
                          </p>
                          {member.workingDaysTag && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Working Days:</span>
                              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {member.workingDaysTag}
                              </span>
                            </div>
                          )}
                          {team?.settings.enableSubgrouping && member.subgroupTag && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Subgroup:</span>
                              <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                                {member.subgroupTag}
                              </span>
                            </div>
                          )}
                          {team?.settings.enableSubgrouping && !member.subgroupTag && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Subgroup:</span>
                              <span className="text-xs font-medium bg-gray-50 text-gray-600 px-2 py-0.5 rounded">
                                Ungrouped
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-gray-600">
                            Joined: {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Unknown'}
                          </p>
                        </div>
                        
                        {/* Action Buttons - Only for members */}
                        {member.role !== 'leader' && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                            {/* Shift Tag Selector */}
                            <div className="flex items-center space-x-2">
                              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Shift:</label>
                              <select
                                value={member.shiftTag || ''}
                                onChange={(e) => handleUpdateShiftTag(member._id!, e.target.value as 'day' | 'night' | 'mixed')}
                                disabled={updating === member._id}
                                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 min-w-0 flex-1"
                              >
                                <option value="">Select shift</option>
                                <option value="day">☀️ Day Shift</option>
                                <option value="night">🌙 Night Shift</option>
                                <option value="mixed">🔄 Mixed Shifts</option>
                              </select>
                            </div>
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteMember(member._id!, member.fullName || member.username)}
                              disabled={deleting === member._id}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {deleting === member._id ? 'Removing...' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Subgroup Section - Only for members when subgrouping is enabled */}
                      {member.role !== 'leader' && team?.settings.enableSubgrouping && team?.settings.subgroups && team.settings.subgroups.length >= 2 && (
                        <div className="border-t border-gray-200 pt-4">
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Subgroup:</label>
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
                              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 flex-1 max-w-xs"
                            >
                              <option value="">Ungrouped</option>
                              {team.settings.subgroups.map((subgroupName) => (
                                <option key={subgroupName} value={subgroupName}>
                                  {subgroupName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Members in the same subgroup share concurrent leave limits and analytics.
                          </p>
                        </div>
                      )}

                      {/* Schedule Section - Only for members */}
                      {member.role !== 'leader' && (
                        <div className="border-t border-gray-200 pt-4">
                          {editingSchedule === member._id ? (
                            <div className="space-y-3">
                              <div className="border rounded-lg p-4 bg-gray-50">
                                <h5 className="text-sm font-medium text-gray-700 mb-3">Edit Shift Schedule</h5>
                                <ShiftScheduleBuilder 
                                  onScheduleChange={setTempSchedule}
                                  initialSchedule={tempSchedule || undefined}
                                />
                              </div>
                              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                <button
                                  onClick={() => handleSaveSchedule(member._id!)}
                                  disabled={updating === member._id}
                                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                  {updating === member._id ? 'Saving...' : 'Save Schedule'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                              <p className="text-sm text-gray-600">
                                Schedule: {member.shiftSchedule?.type === 'rotating' ? 'Rotating' : 'Fixed'} 
                                {member.shiftSchedule?.pattern && (
                                  <span className="ml-2">
                                    ({member.shiftSchedule.pattern.map(day => day ? 'W' : 'O').join('')})
                                  </span>
                                )}
                              </p>
                              <button
                                onClick={() => handleEditSchedule(member)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium self-start"
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
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">💡 Shift Tag Information</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>☀️ Day Shift:</strong> Members who primarily work during day hours</p>
            <p><strong>🌙 Night Shift:</strong> Members who primarily work during night hours</p>
            <p><strong>🔄 Mixed Shifts:</strong> Members who work both day and night shifts</p>
            <p className="mt-2 text-blue-700">
              <strong>Note:</strong> Shift tags help with concurrent leave management - members with different shift tags can take leave simultaneously without affecting coverage. Team leaders don&apos;t need shift tags as they manage the team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
