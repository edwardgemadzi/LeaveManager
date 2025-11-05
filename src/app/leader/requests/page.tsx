'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import MigrationCalendar from '@/components/shared/MigrationCalendar';
import { LeaveRequest, User } from '@/types';
import { LEAVE_REASONS, EMERGENCY_REASONS, isEmergencyReason } from '@/lib/leaveReasons';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function LeaderRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        // Fetch team data
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const teamData = await teamResponse.json();
        setMembers(teamData.members);

        // Fetch all requests
        const requestsResponse = await fetch(`/api/leave-requests?teamId=${user.teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const allRequests = await requestsResponse.json();
        setRequests(allRequests);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
        setRequests(requests.map(req => 
          req._id === requestId ? { ...req, status: 'approved' } : req
        ));
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
        setRequests(requests.map(req => 
          req._id === requestId ? { ...req, status: 'rejected' } : req
        ));
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('Are you sure you want to delete this approved request? This action cannot be undone and will affect the member\'s leave balance.')) {
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
        setRequests(requests.filter(req => req._id !== requestId));
        // Dispatch custom event to trigger refresh on other pages
        window.dispatchEvent(new CustomEvent('leaveRequestDeleted'));
        alert('Request deleted successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete request');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Network error. Please try again.');
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
        setRequests([data, ...requests]);
        setEmergencyForm({
          memberId: '',
          startDate: '',
          endDate: '',
          reason: '',
          password: ''
        });
        setShowEmergencyForm(false);
        alert('Emergency leave request created and auto-approved!');
      } else {
        alert(data.error || 'Failed to create emergency request');
      }
    } catch (error) {
      console.error('Error creating emergency request:', error);
      alert('Network error. Please try again.');
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
            startDate: new Date(req.startDate),
            endDate: new Date(req.endDate),
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
      alert('Please select at least one date range on the calendar');
      return;
    }

    if (!migrationForm.memberId || !selectedReasonType) {
      alert('Please select a member and choose a reason');
      return;
    }

    if (selectedReasonType === 'other' && !migrationForm.customReason.trim()) {
      alert('Please provide details for the leave reason');
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
            startDate: range.startDate.toISOString().split('T')[0],
            endDate: range.endDate.toISOString().split('T')[0],
            reason: finalReason,
            requestedFor: migrationForm.memberId,
            isHistorical: true
          }),
        })
      );

      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        // Refresh requests list
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const requestsResponse = await fetch(`/api/leave-requests?teamId=${user.teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (requestsResponse.ok) {
          const allRequests = await requestsResponse.json();
          setRequests(allRequests);
        }

        if (errorCount === 0) {
          alert(`Successfully created ${successCount} historical leave ${successCount === 1 ? 'entry' : 'entries'}!`);
        } else {
          alert(`Created ${successCount} entries. ${errorCount} failed.`);
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
        alert(`Failed to create historical requests. ${errorCount} error(s).`);
      }
    } catch (error) {
      console.error('Error creating historical requests:', error);
      alert('Network error. Please try again.');
    } finally {
      setSubmittingMigration(false);
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true;
    return request.status === filter;
  });

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
          <div className="animate-spin rounded-full h-32 w-32 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Team Requests</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Manage leave requests from your team members.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowMigrationForm(!showMigrationForm)}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Historical Entry
              </button>
              <button
                onClick={() => setShowEmergencyForm(!showEmergencyForm)}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  Emergency Request
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Historical/Migration Entry Form */}
        {showMigrationForm && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h2 className="text-lg font-medium text-blue-900 dark:text-blue-300 mb-4">
              Add Historical Leave Entries
            </h2>
            <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
              Use this to record leave that has already been taken (for migration purposes). Select a member, then click dates on the calendar to select multiple leave periods. Historical entries are automatically approved and bypass notice period and concurrent leave restrictions.
            </p>
            
            <form onSubmit={handleMigrationRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="migrationMemberId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Member
                  </label>
                  <select
                    id="migrationMemberId"
                    required
                    value={migrationForm.memberId}
                    onChange={(e) => setMigrationForm({ ...migrationForm, memberId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
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
                  <label htmlFor="migrationReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason (applies to all selected periods)
                  </label>
                  <select
                    id="migrationReason"
                    required
                    value={selectedReasonType}
                    onChange={(e) => handleMigrationReasonChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                  >
                    <option value="">Select a reason...</option>
                    {LEAVE_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  
                  {selectedReasonType === 'other' && (
                    <div className="mt-3">
                      <label htmlFor="migrationCustomReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Please specify
                      </label>
                      <textarea
                        id="migrationCustomReason"
                        rows={3}
                        required
                        value={migrationForm.customReason}
                        onChange={(e) => setMigrationForm({ ...migrationForm, customReason: e.target.value })}
                        placeholder="Please provide details for the leave reason..."
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
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

              <div className="flex justify-end space-x-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowMigrationForm(false);
                    setSelectedRanges([]);
                    setExistingRanges([]);
                    setMigrationForm({ memberId: '', reason: '', customReason: '' });
                    setSelectedReasonType('');
                  }}
                  className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMigration || selectedRanges.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingMigration 
                    ? `Creating ${selectedRanges.length} entries...` 
                    : `Add ${selectedRanges.length} Historical ${selectedRanges.length === 1 ? 'Entry' : 'Entries'}`
                  }
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Emergency Request Form */}
        {showEmergencyForm && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-lg font-medium text-red-900 dark:text-red-300 mb-4 flex items-center gap-2">
              <ExclamationTriangleIcon className="h-6 w-6" />
              Create Emergency Leave Request
            </h2>
            <p className="text-sm text-red-700 dark:text-red-400 mb-4">
              This will create an emergency leave request that bypasses normal team settings and is automatically approved.
            </p>
            
            <form onSubmit={handleEmergencyRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="memberId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Member
                  </label>
                  <select
                    id="memberId"
                    required
                    value={emergencyForm.memberId}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, memberId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
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
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason
                  </label>
                  <select
                    id="reason"
                    required
                    value={emergencyForm.reason}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, reason: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
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
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    required
                    value={emergencyForm.startDate}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, startDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    required
                    value={emergencyForm.endDate}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, endDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Your Password (for authentication)
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  value={emergencyForm.password}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, password: e.target.value })}
                  placeholder="Enter your password to authenticate this emergency request"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowEmergencyForm(false)}
                  className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEmergency}
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submittingEmergency ? 'Creating...' : 'Create Emergency Request'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-800">
            <nav className="-mb-px flex space-x-8">
              {[
                { key: 'all', label: 'All Requests' },
                { key: 'pending', label: 'Pending' },
                { key: 'approved', label: 'Approved' },
                { key: 'rejected', label: 'Rejected' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key as 'all' | 'pending' | 'approved' | 'rejected')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
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

        {/* Requests List */}
        <div className="bg-white dark:bg-gray-900 shadow rounded-lg border border-gray-100 dark:border-gray-800">
          <div className="px-4 py-5 sm:p-6">
            {filteredRequests.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No requests found.</p>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => {
                  const member = members.find(m => m._id === request.userId);
                  return (
                    <div key={request._id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 bg-gray-50 dark:bg-gray-900">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                              {member?.username || 'Unknown User'}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-gray-700 dark:text-gray-300 mt-2">{request.reason}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Requested on {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                            {request.requestedBy && (() => {
                              // Check if this is an emergency request (created through emergency endpoint)
                              // Only mark as emergency if reason exactly matches EMERGENCY_REASONS values
                              const isEmergency = request.reason && isEmergencyReason(request.reason);
                              
                              // Check if this is a historical entry (created by leader, approved, and start date is in the past)
                              // Only if it's NOT an emergency request
                              const isHistorical = !isEmergency && 
                                request.status === 'approved' && 
                                new Date(request.startDate) < new Date();
                              
                              if (isEmergency) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                                    <ExclamationTriangleIcon className="h-3 w-3" />
                                    Emergency
                                  </span>
                                );
                              } else if (isHistorical) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                    Historical
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(request._id!)}
                                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(request._id!)}
                                className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {request.status === 'approved' && (
                            <button
                              onClick={() => handleDelete(request._id!)}
                              disabled={deleting === request._id}
                              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete approved request"
                            >
                              {deleting === request._id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
