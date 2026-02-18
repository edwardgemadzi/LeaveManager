'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import MigrationCalendar from '@/components/shared/MigrationCalendar';
import { LeaveRequest, User } from '@/types';
import { LEAVE_REASONS, EMERGENCY_REASONS, isEmergencyReason } from '@/lib/leaveReasons';
import { ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useNotification } from '@/hooks/useNotification';
import { useTeamEvents } from '@/hooks/useTeamEvents';
import { useTeamData } from '@/hooks/useTeamData';
import { useRequests } from '@/hooks/useRequests';
import { parseDateSafe, formatDateSafe } from '@/lib/dateUtils';

export default function LeaderRequestsPage() {
  const { showSuccess, showError, showInfo } = useNotification();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'deleted'>('all');
  
  // Emergency request state
  const [showEmergencyForm, setShowEmergencyForm] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({
    memberId: '',
    startDate: '',
    endDate: '',
    reason: '',
    password: ''
  });
  const [submittingEmergency, setSubmittingEmergency] = useState(false);
  
  // Historical/Migration request state
  const [showMigrationForm, setShowMigrationForm] = useState(false);
  const [migrationForm, setMigrationForm] = useState({
    memberId: '',
    reason: '',
    customReason: ''
  });
  const [selectedReasonType, setSelectedReasonType] = useState('');
  const [selectedRanges, setSelectedRanges] = useState<Array<{ startDate: Date; endDate: Date }>>([]);
  const [existingRanges, setExistingRanges] = useState<Array<{ startDate: Date; endDate: Date }>>([]);
  const [submittingMigration, setSubmittingMigration] = useState(false);

  const handleMigrationReasonChange = (reasonType: string) => {
    setSelectedReasonType(reasonType);
    if (reasonType === 'other') {
      setMigrationForm({ ...migrationForm, reason: '', customReason: '' });
    } else {
      const selectedReason = LEAVE_REASONS.find(r => r.value === reasonType);
      setMigrationForm({ ...migrationForm, reason: selectedReason?.label || '', customReason: '' });
    }
  };

  const getMigrationFinalReason = () => {
    if (selectedReasonType === 'other') {
      return migrationForm.customReason || migrationForm.reason;
    }
    return migrationForm.reason;
  };
  
  const [deleting, setDeleting] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const { data: teamData, mutate: mutateTeam, isLoading: teamLoading } = useTeamData({ members: 'full' });
  const { data: requestsData, mutate: mutateRequests, isLoading: requestsLoading } = useRequests({
    teamId,
    includeDeleted: true,
    fields: ['_id', 'userId', 'startDate', 'endDate', 'reason', 'status', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'requestedBy'],
  });

  useEffect(() => {
    if (teamData?.members) {
      setMembers(teamData.members);
    }
    if (teamData?.team?._id) {
      setTeamId(teamData.team._id);
    }
  }, [teamData]);

  useEffect(() => {
    if (requestsData) {
      setRequests(requestsData);
    }
  }, [requestsData]);

  useEffect(() => {
    setLoading(teamLoading || requestsLoading);
  }, [teamLoading, requestsLoading]);

  useEffect(() => {
    setVisibleCount(50);
  }, [filter]);

  // Real-time updates using SSE
  useTeamEvents(teamId, {
    enabled: !loading && !!teamId,
    onEvent: (event) => {
      // Refresh requests list when events received
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

  const handleApprove = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (response.ok) {
        await mutateRequests();
      }
    } catch (err) {
      console.error('Error approving request:', err);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (response.ok) {
        await mutateRequests();
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('Are you sure you want to delete this approved request? It will move to the Deleted tab and can be restored.')) {
      return;
    }

    setDeleting(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await mutateRequests();
        // Dispatch custom event to trigger refresh on other pages
        window.dispatchEvent(new CustomEvent('leaveRequestDeleted'));
        showSuccess('Request deleted successfully');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to delete request');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      showError('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleRestore = async (requestId: string) => {
    setDeleting(requestId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests/${requestId}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await mutateRequests();
        window.dispatchEvent(new CustomEvent('leaveRequestRestored'));
        showSuccess('Request restored successfully');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to restore request');
      }
    } catch (error) {
      console.error('Error restoring request:', error);
      showError('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleEmergencyRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingEmergency(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/leave-requests/emergency', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...emergencyForm,
          isEmergency: true
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Add the new request to the list
        await mutateRequests();
        setEmergencyForm({
          memberId: '',
          startDate: '',
          endDate: '',
          reason: '',
          password: ''
        });
        setShowEmergencyForm(false);
        showSuccess('Emergency leave request created and auto-approved!');
      } else {
        showError(data.error || 'Failed to create emergency request');
      }
    } catch (error) {
      console.error('Error creating emergency request:', error);
      showError('Network error. Please try again.');
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // Fetch existing leave dates for selected member
  useEffect(() => {
    if (!migrationForm.memberId || !showMigrationForm) {
      setExistingRanges([]);
      return;
    }

    const fetchExistingRanges = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/leave-requests', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const allRequests: LeaveRequest[] = await response.json();
          const memberRequests = allRequests.filter(
            req => req.userId === migrationForm.memberId && req.status === 'approved'
          );
          
          const ranges = memberRequests.map(req => ({
            startDate: parseDateSafe(req.startDate),
            endDate: parseDateSafe(req.endDate),
          }));
          
          setExistingRanges(ranges);
        }
      } catch (error) {
        console.error('Error fetching existing leave:', error);
      }
    };

    fetchExistingRanges();
  }, [migrationForm.memberId, showMigrationForm]);

  const handleMigrationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedRanges.length === 0) {
      showInfo('Please select at least one date range on the calendar');
      return;
    }

    if (!migrationForm.memberId || !selectedReasonType) {
      showInfo('Please select a member and choose a reason');
      return;
    }

    if (selectedReasonType === 'other' && !migrationForm.customReason.trim()) {
      showInfo('Please provide details for the leave reason');
      return;
    }

    const finalReason = getMigrationFinalReason();

    setSubmittingMigration(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const token = localStorage.getItem('token');
      
      // Create leave requests for each selected range
      const promises = selectedRanges.map(range => 
        fetch('/api/leave-requests', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: formatDateSafe(range.startDate),
            endDate: formatDateSafe(range.endDate),
            reason: finalReason,
            requestedFor: migrationForm.memberId,
            isHistorical: true
          }),
        })
      );

      const results = await Promise.allSettled(promises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        await mutateRequests();

        if (errorCount === 0) {
          showSuccess(`Successfully created ${successCount} historical leave ${successCount === 1 ? 'entry' : 'entries'}!`);
        } else {
          showSuccess(`Created ${successCount} entries. ${errorCount} failed.`);
        }
        
        setMigrationForm({
          memberId: '',
          reason: '',
          customReason: ''
        });
        setSelectedReasonType('');
        setSelectedRanges([]);
        setShowMigrationForm(false);
      } else {
        showError(`Failed to create historical requests. ${errorCount} error(s).`);
      }
    } catch (error) {
      console.error('Error creating historical requests:', error);
      showError('Network error. Please try again.');
    } finally {
      setSubmittingMigration(false);
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filter === 'deleted') {
      return !!request.deletedAt;
    }
    if (request.deletedAt) return false;
    if (filter === 'all') return true;
    return request.status === filter;
  });

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    if (filter === 'deleted') {
      const aDeleted = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const bDeleted = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return bDeleted - aDeleted;
    }

    const statusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const pagedRequests = sortedRequests.slice(0, visibleCount);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
      case 'approved': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
      case 'rejected': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400';
      default: return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading requests...</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Team Requests</h1>
              <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Manage leave requests from your team members</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowMigrationForm(!showMigrationForm)}
                className="btn-primary flex items-center justify-center gap-2 px-4 py-2.5"
              >
                Historical Entry
              </button>
              <button
                onClick={() => setShowEmergencyForm(!showEmergencyForm)}
                className="btn-danger flex items-center justify-center gap-2 px-4 py-2.5"
              >
                <ExclamationTriangleIcon className="h-5 w-5" />
                Emergency Request
              </button>
            </div>
          </div>
        </div>

        {/* Historical/Migration Entry Form - Enhanced */}
        {showMigrationForm && (
          <div className="card mb-8 bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-blue-900 dark:text-blue-200 mb-2">
                    Add Historical Leave Entries
                  </h2>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Use this to record leave that has already been taken (for migration purposes). Select a member, then click dates on the calendar to select multiple leave periods. Historical entries are automatically approved and bypass notice period and concurrent leave restrictions.
                  </p>
                </div>
              </div>
            
              <form onSubmit={handleMigrationRequest} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="migrationMemberId" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Select Member
                    </label>
                    <select
                      id="migrationMemberId"
                      required
                      value={migrationForm.memberId}
                      onChange={(e) => setMigrationForm({ ...migrationForm, memberId: e.target.value })}
                      className="input-modern w-full"
                    >
                    <option value="">Choose a member...</option>
                    {members.filter(member => member.role !== 'leader').map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.fullName || member.username}
                      </option>
                    ))}
                  </select>
                </div>

                  <div>
                    <label htmlFor="migrationReason" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Reason (applies to all selected periods)
                    </label>
                    <select
                      id="migrationReason"
                      required
                      value={selectedReasonType}
                      onChange={(e) => handleMigrationReasonChange(e.target.value)}
                      className="input-modern w-full"
                    >
                    <option value="">Select a reason...</option>
                    {LEAVE_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  
                    {selectedReasonType === 'other' && (
                      <div className="mt-4">
                        <label htmlFor="migrationCustomReason" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Please specify
                        </label>
                        <textarea
                          id="migrationCustomReason"
                          rows={3}
                          required
                          value={migrationForm.customReason}
                          onChange={(e) => setMigrationForm({ ...migrationForm, customReason: e.target.value })}
                          placeholder="Please provide details for the leave reason..."
                          className="input-modern w-full"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Calendar Component */}
                <div className="mt-6">
                  <MigrationCalendar
                    selectedMemberId={migrationForm.memberId}
                    onRangesChange={setSelectedRanges}
                    existingRanges={existingRanges}
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMigrationForm(false);
                      setSelectedRanges([]);
                      setExistingRanges([]);
                      setMigrationForm({ memberId: '', reason: '', customReason: '' });
                      setSelectedReasonType('');
                    }}
                    className="btn-secondary px-4 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingMigration || selectedRanges.length === 0}
                    className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingMigration 
                      ? `Creating ${selectedRanges.length} entries...` 
                      : `Add ${selectedRanges.length} Historical ${selectedRanges.length === 1 ? 'Entry' : 'Entries'}`
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Emergency Request Form - Enhanced */}
        {showEmergencyForm && (
          <div className="card mb-8 bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-lg flex items-center justify-center">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-red-900 dark:text-red-200 mb-2">
                    Create Emergency Leave Request
                  </h2>
                  <p className="text-sm text-red-800 dark:text-red-300">
                    This will create an emergency leave request that bypasses normal team settings and is automatically approved.
                  </p>
                </div>
              </div>
            
              <form onSubmit={handleEmergencyRequest} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="memberId" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Select Member
                    </label>
                    <select
                      id="memberId"
                      required
                      value={emergencyForm.memberId}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, memberId: e.target.value })}
                      className="input-modern w-full"
                    >
                    <option value="">Choose a member...</option>
                    {members.filter(member => member.role !== 'leader').map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.fullName || member.username}
                      </option>
                    ))}
                  </select>
                </div>

                  <div>
                    <label htmlFor="reason" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Reason
                    </label>
                    <select
                      id="reason"
                      required
                      value={emergencyForm.reason}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, reason: e.target.value })}
                      className="input-modern w-full"
                    >
                    <option value="">Select reason...</option>
                    {EMERGENCY_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>

                  <div>
                    <label htmlFor="startDate" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      required
                      value={emergencyForm.startDate}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, startDate: e.target.value })}
                      className="input-modern w-full"
                    />
                  </div>

                  <div>
                    <label htmlFor="endDate" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      required
                      value={emergencyForm.endDate}
                      onChange={(e) => setEmergencyForm({ ...emergencyForm, endDate: e.target.value })}
                      className="input-modern w-full"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Your Password (for authentication)
                  </label>
                  <input
                    type="password"
                    id="password"
                    required
                    value={emergencyForm.password}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, password: e.target.value })}
                    placeholder="Enter your password to authenticate this emergency request"
                    className="input-modern w-full"
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowEmergencyForm(false)}
                    className="btn-secondary px-4 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEmergency}
                    className="btn-danger px-4 py-2.5 disabled:opacity-50"
                  >
                    {submittingEmergency ? 'Creating...' : 'Create Emergency Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filter Tabs - Enhanced */}
        <div className="card mb-8">
          <div className="p-5 sm:p-6">
            <div className="border-b border-gray-200 dark:border-gray-800">
              <nav className="-mb-px flex flex-wrap gap-4 sm:gap-8">
                {[
                  { key: 'all', label: 'All Requests' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'approved', label: 'Approved' },
                  { key: 'rejected', label: 'Rejected' },
                  { key: 'deleted', label: 'Deleted' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key as 'all' | 'pending' | 'approved' | 'rejected' | 'deleted')}
                    className={`py-2 px-1 border-b-2 font-semibold text-sm transition-colors ${
                      filter === tab.key
                        ? 'tab-active'
                        : 'tab-inactive'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Requests List - Enhanced */}
        <div className="card">
          <div className="p-5 sm:p-6">
            {sortedRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <svg className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-base font-medium text-gray-500 dark:text-gray-400">No requests found</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {pagedRequests.map((request) => {
                  const member = members.find(m => m._id === request.userId);
                  return (
                    <div key={request._id} className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800/50 rounded-xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 stagger-item">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-3 mb-3">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {member?.fullName || member?.username || 'Unknown User'}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            {request.deletedAt && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                deleted
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                            {parseDateSafe(request.startDate).toLocaleDateString()} - {parseDateSafe(request.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-base text-gray-700 dark:text-gray-300 mb-3">{request.reason}</p>
                          <div className="flex items-center flex-wrap gap-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Requested on {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                            {request.requestedBy && (() => {
                              const isEmergency = request.reason && isEmergencyReason(request.reason);
                              const isHistorical = !isEmergency && 
                                request.status === 'approved' && 
                                parseDateSafe(request.startDate) < new Date();
                              
                              if (isEmergency) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                                    <ExclamationTriangleIcon className="h-3 w-3" />
                                    Emergency
                                  </span>
                                );
                              } else if (isHistorical) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                    Historical
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:ml-4 sm:flex-shrink-0">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(request._id!)}
                                className="btn-success flex items-center justify-center gap-2 px-4 py-2.5 min-w-[100px]"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(request._id!)}
                                className="btn-danger flex items-center justify-center gap-2 px-4 py-2.5 min-w-[100px]"
                              >
                                <XCircleIcon className="h-4 w-4" />
                                Reject
                              </button>
                            </>
                          )}
                          {request.status === 'approved' && !request.deletedAt && (
                            <button
                              onClick={() => handleDelete(request._id!)}
                              disabled={deleting === request._id}
                              className="btn-danger px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete approved request"
                            >
                              {deleting === request._id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                          {request.deletedAt && (
                            <button
                              onClick={() => handleRestore(request._id!)}
                              disabled={deleting === request._id}
                              className="btn-primary px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Restore request"
                            >
                              {deleting === request._id ? 'Restoring...' : 'Restore'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sortedRequests.length > pagedRequests.length && (
                  <div className="pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount(prev => prev + 50)}
                      className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
