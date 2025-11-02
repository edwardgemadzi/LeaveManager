'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { LeaveRequest, User } from '@/types';

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

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true;
    return request.status === filter;
  });

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
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Team Requests</h1>
              <p className="mt-2 text-gray-600">Manage leave requests from your team members.</p>
            </div>
            <button
              onClick={() => setShowEmergencyForm(!showEmergencyForm)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              🚨 Emergency Request
            </button>
          </div>
        </div>

        {/* Emergency Request Form */}
        {showEmergencyForm && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-medium text-red-900 mb-4">🚨 Create Emergency Leave Request</h2>
            <p className="text-sm text-red-700 mb-4">
              This will create an emergency leave request that bypasses normal team settings and is automatically approved.
            </p>
            
            <form onSubmit={handleEmergencyRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="memberId" className="block text-sm font-medium text-gray-700">
                    Select Member
                  </label>
                  <select
                    id="memberId"
                    required
                    value={emergencyForm.memberId}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, memberId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                    Reason
                  </label>
                  <select
                    id="reason"
                    required
                    value={emergencyForm.reason}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, reason: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="">Select reason...</option>
                    <option value="Medical Emergency">Medical Emergency</option>
                    <option value="Family Emergency">Family Emergency</option>
                    <option value="Personal Crisis">Personal Crisis</option>
                    <option value="Other Emergency">Other Emergency</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    required
                    value={emergencyForm.startDate}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, startDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                    value={emergencyForm.endDate}
                    onChange={(e) => setEmergencyForm({ ...emergencyForm, endDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Your Password (for authentication)
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  value={emergencyForm.password}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, password: e.target.value })}
                  placeholder="Enter your password to authenticate this emergency request"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowEmergencyForm(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEmergency}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submittingEmergency ? 'Creating...' : 'Create Emergency Request'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
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
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {filteredRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No requests found.</p>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => {
                  const member = members.find(m => m._id === request.userId);
                  return (
                    <div key={request._id} className="border rounded-lg p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-lg font-medium text-gray-900">
                              {member?.username || 'Unknown User'}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-gray-700 mt-2">{request.reason}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <p className="text-xs text-gray-500">
                              Requested on {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                            {request.requestedBy && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                🚨 Emergency
                              </span>
                            )}
                          </div>
                        </div>
                        {request.status === 'pending' && (
                          <div className="flex space-x-2 ml-4">
                            <button
                              onClick={() => handleApprove(request._id!)}
                              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(request._id!)}
                              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
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
