'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ShiftScheduleBuilder from '@/components/ShiftScheduleBuilder';
import { User, ShiftSchedule } from '@/types';

export default function LeaderMembersPage() {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [tempSchedule, setTempSchedule] = useState<ShiftSchedule | null>(null);

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
        setMembers(members.map(member => 
          member._id === memberId 
            ? { ...member, shiftSchedule: tempSchedule }
            : member
        ));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
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
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Team Members</h1>
          <p className="mt-2 text-gray-600">Manage your team members and their shift assignments.</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {members.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No team members found.</p>
            ) : (
              <div className="space-y-4">
                {members.map((member) => (
                  <div key={member._id} className="border rounded-lg p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
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
                        <p className="text-sm text-gray-600">
                          Joined: {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Unknown'}
                        </p>
                        {member.role !== 'leader' && (
                          <div className="mt-2">
                            {editingSchedule === member._id ? (
                              <div className="space-y-3">
                                <div className="border rounded-lg p-4 bg-gray-50">
                                  <h5 className="text-sm font-medium text-gray-700 mb-3">Edit Shift Schedule</h5>
                                  <ShiftScheduleBuilder 
                                    onScheduleChange={setTempSchedule}
                                    initialSchedule={tempSchedule || undefined}
                                  />
                                </div>
                                <div className="flex space-x-2">
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
                              <div className="flex items-center space-x-2">
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
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {/* Shift Tag Selector - Only for members */}
                        {member.role !== 'leader' && (
                          <div className="flex items-center space-x-2">
                            <label className="text-sm font-medium text-gray-700">Shift:</label>
                            <select
                              value={member.shiftTag || ''}
                              onChange={(e) => handleUpdateShiftTag(member._id!, e.target.value as 'day' | 'night' | 'mixed')}
                              disabled={updating === member._id}
                              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                            >
                              <option value="">Select shift</option>
                              <option value="day">☀️ Day Shift</option>
                              <option value="night">🌙 Night Shift</option>
                              <option value="mixed">🔄 Mixed Shifts</option>
                            </select>
                          </div>
                        )}
                        
                        {/* Delete Button */}
                        {member.role !== 'leader' && (
                          <button
                            onClick={() => handleDeleteMember(member._id!, member.fullName || member.username)}
                            disabled={deleting === member._id}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deleting === member._id ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </div>
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
