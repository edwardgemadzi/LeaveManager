'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance } from '@/lib/leaveCalculations';

export default function LeaderDashboard() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  const handleApprove = async (requestId: string) => {
    setProcessingRequest(requestId);
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
        // Refetch all data to update balances
        await refetchData();
      }
    } catch (error) {
      console.error('Error approving request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingRequest(requestId);
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
        // Refetch all data to update balances
        await refetchData();
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
    } finally {
      setProcessingRequest(null);
    }
  };

  const refetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');

      // Fetch team data
      const teamResponse = await fetch('/api/team', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!teamResponse.ok) {
        console.error('Failed to fetch team data:', teamResponse.status, teamResponse.statusText);
        const errorData = await teamResponse.json();
        console.error('Error details:', errorData);
        return;
      }
      
      const teamData = await teamResponse.json();
      console.log('Team data received:', teamData);
      setTeam(teamData.team);
      setMembers(teamData.members || []);

      // Fetch all requests
      const requestsResponse = await fetch(`/api/leave-requests?teamId=${user.teamId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!requestsResponse.ok) {
        console.error('Failed to fetch requests:', requestsResponse.status, requestsResponse.statusText);
        const errorData = await requestsResponse.json();
        console.error('Error details:', errorData);
        return;
      }
      
      const requests = await requestsResponse.json();
      console.log('Requests received:', requests);
      setAllRequests(requests);
      setPendingRequests(requests.filter((req: LeaveRequest) => req.status === 'pending'));
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        await refetchData();
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getLeaveBalanceSummary = () => {
    if (!team || !members.length) return { totalRemaining: 0, averageRemaining: 0, membersWithLowBalance: 0 };

    let totalRemaining = 0;
    let membersWithLowBalance = 0;
    const maxLeavePerYear = team.settings.maxLeavePerYear;

    members.forEach(member => {
      if (member.role === 'member' && member.shiftSchedule) {
        const memberRequests = allRequests.filter(req => 
          req.userId === member._id && req.status === 'approved'
        );

        const approvedRequests = memberRequests.map(req => ({
          startDate: new Date(req.startDate),
          endDate: new Date(req.endDate)
        }));

        const remainingBalance = calculateLeaveBalance(
          maxLeavePerYear,
          approvedRequests,
          member.shiftSchedule
        );

        totalRemaining += remainingBalance;
        
        // Consider low balance if less than 25% of max leave remaining
        if (remainingBalance < maxLeavePerYear * 0.25) {
          membersWithLowBalance++;
        }
      }
    });

    const memberCount = members.filter(m => m.role === 'member').length;
    const averageRemaining = memberCount > 0 ? Math.round(totalRemaining / memberCount) : 0;

    return { totalRemaining, averageRemaining, membersWithLowBalance };
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="spinner w-16 h-16 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8 fade-in">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Leader Dashboard</h1>
            <p className="text-gray-600 text-lg">Welcome back! Here&apos;s what&apos;s happening with your team</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="card card-hover slide-up">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">👥</span>
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Team Members</dt>
                      <dd className="text-2xl font-bold text-gray-900">{members?.length || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">⏳</span>
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Pending Requests</dt>
                      <dd className="text-2xl font-bold text-gray-900">{pendingRequests?.length || 0}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">📊</span>
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Avg Leave Balance</dt>
                      <dd className="text-2xl font-bold text-gray-900">{getLeaveBalanceSummary().averageRemaining}</dd>
                      <dd className="text-xs text-gray-400 mt-1">
                        {getLeaveBalanceSummary().membersWithLowBalance} member(s) with low balance
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Team Leave Balances */}
          <div className="card card-hover slide-up mb-8" style={{ animationDelay: '0.3s' }}>
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                Team Leave Balances
              </h3>
              {members.filter(m => m.role === 'member').length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">👥</div>
                  <p className="text-gray-500">No team members yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {members
                    .filter(member => member.role === 'member')
                    .map(member => {
                      const memberRequests = allRequests.filter(req => 
                        req.userId === member._id && req.status === 'approved'
                      );

                      const approvedRequests = memberRequests.map(req => ({
                        startDate: new Date(req.startDate),
                        endDate: new Date(req.endDate)
                      }));

                      const remainingBalance = member.shiftSchedule ? calculateLeaveBalance(
                        team?.settings.maxLeavePerYear || 20,
                        approvedRequests,
                        member.shiftSchedule
                      ) : 0;

                      const isLowBalance = remainingBalance < (team?.settings.maxLeavePerYear || 20) * 0.25;

                      return (
                        <div key={member._id} className={`border rounded-lg p-4 ${isLowBalance ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                {member.fullName || member.username}
                              </h4>
                              <p className="text-sm text-gray-600">
                                {member.shiftTag && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2">
                                    {member.shiftTag === 'day' && '☀️ Day'}
                                    {member.shiftTag === 'night' && '🌙 Night'}
                                    {member.shiftTag === 'mixed' && '🔄 Mixed'}
                                  </span>
                                )}
                                {member.shiftSchedule?.type === 'rotating' ? 'Rotating' : 'Fixed'}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${isLowBalance ? 'text-orange-600' : 'text-green-600'}`}>
                                {remainingBalance}
                              </div>
                              <div className="text-xs text-gray-500">
                                of {team?.settings.maxLeavePerYear || 20} days
                              </div>
                            </div>
                          </div>
                          {isLowBalance && (
                            <div className="mt-2 text-xs text-orange-600 font-medium">
                              ⚠️ Low balance
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Pending Requests */}
          <div className="card card-hover bounce-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                Recent Pending Requests
              </h3>
              {!pendingRequests || pendingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <p className="text-gray-500 text-lg">No pending requests at the moment</p>
                  <p className="text-gray-400 text-sm mt-2">All caught up! 🎉</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.slice(0, 5).map((request, index) => {
                    const member = members?.find(m => m._id === request.userId);
                    return (
                      <div key={request._id} className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-gray-300 transition-all duration-200" style={{ animationDelay: `${index * 0.1}s` }}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 mb-1">
                              👤 {member?.username || 'Unknown User'}
                            </h4>
                            <p className="text-sm text-gray-600 mb-1">
                              📅 {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-700 font-medium">{request.reason}</p>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <button 
                              onClick={() => handleApprove(request._id!)}
                              disabled={processingRequest === request._id}
                              className="btn-success text-xs py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingRequest === request._id ? '⏳' : '✅'} 
                              {processingRequest === request._id ? 'Processing...' : 'Approve'}
                            </button>
                            <button 
                              onClick={() => handleReject(request._id!)}
                              disabled={processingRequest === request._id}
                              className="btn-danger text-xs py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingRequest === request._id ? '⏳' : '❌'} 
                              {processingRequest === request._id ? 'Processing...' : 'Reject'}
                            </button>
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
    </ProtectedRoute>
  );
}
