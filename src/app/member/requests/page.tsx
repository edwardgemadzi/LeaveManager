'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { LeaveRequest } from '@/types';

export default function MemberRequestsPage() {
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    customReason: '',
  });
  const [teamSettings, setTeamSettings] = useState({
    minimumNoticePeriod: 1,
  });
  const [selectedReasonType, setSelectedReasonType] = useState('');

  const leaveReasons = [
    { value: 'vacation', label: '🏖️ Vacation' },
    { value: 'sick', label: '🤒 Sick Leave' },
    { value: 'personal', label: '👤 Personal' },
    { value: 'family', label: '👨‍👩‍👧‍👦 Family Emergency' },
    { value: 'medical', label: '🏥 Medical Appointment' },
    { value: 'bereavement', label: '🕊️ Bereavement' },
    { value: 'maternity', label: '👶 Maternity/Paternity' },
    { value: 'study', label: '📚 Study/Education' },
    { value: 'religious', label: '⛪ Religious Holiday' },
    { value: 'other', label: '📝 Other (specify below)' },
  ];
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleReasonChange = (reasonType: string) => {
    setSelectedReasonType(reasonType);
    if (reasonType === 'other') {
      setFormData({ ...formData, reason: '' });
    } else {
      const selectedReason = leaveReasons.find(r => r.value === reasonType);
      setFormData({ ...formData, reason: selectedReason?.label || '', customReason: '' });
    }
  };

  const getFinalReason = () => {
    if (selectedReasonType === 'other') {
      return formData.customReason || formData.reason;
    }
    return formData.reason;
  };

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
        setTeamSettings(teamData.team?.settings || { minimumNoticePeriod: 1 });

        // Fetch my requests
        const requestsResponse = await fetch(`/api/leave-requests?teamId=${user.teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const allRequests = await requestsResponse.json();
        const myRequests = allRequests.filter((req: LeaveRequest) => req.userId === user.id);
        setMyRequests(myRequests);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!selectedReasonType) {
      alert('Please select a reason for your leave request.');
      return;
    }
    
    if (selectedReasonType === 'other' && !formData.customReason.trim()) {
      alert('Please provide details for your leave request.');
      return;
    }
    
    // Check minimum notice period
    if (teamSettings.minimumNoticePeriod > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(formData.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const daysDifference = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDifference < teamSettings.minimumNoticePeriod) {
        alert(`Leave requests must be submitted at least ${teamSettings.minimumNoticePeriod} day(s) in advance. Please select a start date ${teamSettings.minimumNoticePeriod} or more days from today.`);
        return;
      }
    }
    
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          reason: getFinalReason(),
        }),
      });

      if (response.ok) {
        const newRequest = await response.json();
        setMyRequests([newRequest, ...myRequests]);
        setFormData({ startDate: '', endDate: '', reason: '', customReason: '' });
        setSelectedReasonType('');
        setShowForm(false);
        alert('Leave request submitted successfully!');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Error submitting request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this request? This action cannot be undone.')) {
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
        setMyRequests(myRequests.filter(req => req._id !== requestId));
        alert('Request cancelled successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Leave Requests</h1>
              <p className="mt-2 text-gray-600">Manage your leave requests and view their status.</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
            >
              {showForm ? 'Cancel' : 'New Request'}
            </button>
          </div>
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Submit Leave Request</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      For single-day leave, use the same date for both start and end
                      {teamSettings.minimumNoticePeriod > 0 && (
                        <span className="block mt-1 text-orange-600">
                          ⚠️ Leave requests must be submitted at least {teamSettings.minimumNoticePeriod} day(s) in advance
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                    Reason for Leave
                  </label>
                  <select
                    id="reason"
                    required
                    value={selectedReasonType}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select a reason...</option>
                    {leaveReasons.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  
                  {selectedReasonType === 'other' && (
                    <div className="mt-3">
                      <label htmlFor="customReason" className="block text-sm font-medium text-gray-700">
                        Please specify
                      </label>
                      <textarea
                        id="customReason"
                        rows={3}
                        required
                        value={formData.customReason}
                        onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Please provide details for your leave request..."
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Requests List */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {myRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No requests yet. Create your first request above.</p>
            ) : (
              <div className="space-y-4">
                {myRequests.map((request) => (
                  <div key={request._id} className="border rounded-lg p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-gray-700 mt-2">{request.reason}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          Requested on {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {request.status === 'pending' && (
                        <div className="ml-4">
                          <button
                            onClick={() => handleDelete(request._id!)}
                            disabled={deleting === request._id}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cancel request"
                          >
                            {deleting === request._id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
