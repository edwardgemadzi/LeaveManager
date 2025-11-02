'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest, Team, User } from '@/types';
import { calculateLeaveBalance, countWorkingDays } from '@/lib/leaveCalculations';
import { MemberAnalytics } from '@/lib/analyticsCalculations';

export default function MemberDashboard() {
  const [team, setTeam] = useState<Team | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<MemberAnalytics | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        setUser(userData); // Set the user state

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
          setTeam(null);
        } else {
          const teamData = await teamResponse.json();
          console.log('Team data received:', teamData);
          setTeam(teamData.team);
          
          // Update user with fresh data from server (including shift schedule)
          if (teamData.currentUser) {
            setUser(teamData.currentUser);
          }
        }

        // Fetch my requests
        const requestsResponse = await fetch(`/api/leave-requests?teamId=${userData.teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!requestsResponse.ok) {
          console.error('Failed to fetch requests:', requestsResponse.status, requestsResponse.statusText);
          const errorData = await requestsResponse.json();
          console.error('Error details:', errorData);
          setMyRequests([]);
          return;
        }
        
        const allRequests = await requestsResponse.json();
        console.log('All requests received:', allRequests);
        
        // Ensure allRequests is an array before filtering
        if (Array.isArray(allRequests)) {
          const myRequests = allRequests.filter((req: LeaveRequest) => req.userId === userData.id);
          setMyRequests(myRequests);
        } else {
          console.error('Expected array but got:', typeof allRequests, allRequests);
          setMyRequests([]);
        }

        // Fetch analytics
        const analyticsResponse = await fetch('/api/analytics', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          console.log('Member Dashboard - Analytics data received:', analyticsData);
          console.log('Member Dashboard - Analytics object:', analyticsData.analytics);
          if (analyticsData.analytics) {
            console.log('Member Dashboard - Fields:', {
              usableDays: analyticsData.analytics.usableDays,
              realisticUsableDays: analyticsData.analytics.realisticUsableDays,
              theoreticalWorkingDays: analyticsData.analytics.theoreticalWorkingDays,
              remainingLeaveBalance: analyticsData.analytics.remainingLeaveBalance
            });
          }
          setAnalytics(analyticsData.analytics);
        } else {
          console.error('Analytics API error:', await analyticsResponse.text());
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getLeaveBalance = () => {
    if (!team || !user) {
      console.log('Leave balance calculation: Missing team or user data', { team: !!team, user: !!user });
      return 0;
    }
    
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved')
      .map(req => ({
        startDate: new Date(req.startDate),
        endDate: new Date(req.endDate)
      }));

    console.log('Leave balance calculation:', {
      maxLeavePerYear: team.settings.maxLeavePerYear,
      approvedRequests: approvedRequests.length,
      shiftSchedule: user.shiftSchedule,
      myRequests: myRequests.length
    });

    const balance = calculateLeaveBalance(
      team.settings.maxLeavePerYear,
      approvedRequests,
      user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' }
    );
    
    console.log('Calculated leave balance:', balance);
    return balance;
  };

  const getTotalWorkingDaysTaken = () => {
    if (!user) return 0;
    
    const currentYear = new Date().getFullYear();
    const approvedRequests = myRequests
      .filter(req => req.status === 'approved' && new Date(req.startDate).getFullYear() === currentYear);

    return approvedRequests.reduce((total, req) => {
      const workingDays = countWorkingDays(
        new Date(req.startDate),
        new Date(req.endDate),
        user.shiftSchedule || { pattern: [true, true, true, true, true, false, false], startDate: new Date(), type: 'rotating' }
      );
      return total + workingDays;
    }, 0);
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

  const leaveBalance = getLeaveBalance();

  return (
    <ProtectedRoute requiredRole="member">
      <div className="min-h-screen">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8 fade-in">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">My Dashboard</h1>
            <p className="text-gray-600 text-lg">Welcome back! Here&apos;s your leave information</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="card card-hover slide-up">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">📅</span>
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Leave Balance</dt>
                      <dd className="text-2xl font-bold text-gray-900">{leaveBalance} days</dd>
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
                      <dd className="text-2xl font-bold text-gray-900">
                        {myRequests.filter(req => req.status === 'pending').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">✅</span>
                    </div>
                  </div>
                  <div className="ml-5 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Working Days Taken This Year</dt>
                      <dd className="text-2xl font-bold text-gray-900">
                        {getTotalWorkingDaysTaken()}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section */}
          {analytics && (
            <div className="mb-8 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Year-End Analytics</h2>
              
              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="card card-hover slide-up">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Realistic Usable Days</h3>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.realisticUsableDays ?? 0}</p>
                      </div>
                      <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl">📊</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Days you can realistically use when shared with {analytics.membersSharingSameShift} member{analytics.membersSharingSameShift !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="card card-hover slide-up" style={{ animationDelay: '0.1s' }}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Usable Days</h3>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.usableDays ?? 0}</p>
                      </div>
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl">✓</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Total days available (accounting for concurrent leave limits)
                    </p>
                  </div>
                </div>

                <div className="card card-hover slide-up" style={{ animationDelay: '0.2s' }}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Theoretical Working Days</h3>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.theoreticalWorkingDays ?? 0}</p>
                      </div>
                      <div className="w-16 h-16 bg-gradient-to-r from-gray-500 to-gray-600 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl">📈</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Total working days remaining (no constraints)
                    </p>
                  </div>
                </div>

                <div className="card card-hover slide-up" style={{ animationDelay: '0.3s' }}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Remaining Leave Balance</h3>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.remainingLeaveBalance}</p>
                      </div>
                      <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl">📅</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Leave days available in your account
                    </p>
                  </div>
                </div>
              </div>

              {/* Competition Context Card */}
              <div className="card border-2 border-blue-300 bg-blue-50 mb-6">
                <div className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-lg">👥</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-blue-900 mb-1">Competition Context</p>
                      <p className="text-sm text-blue-700 mb-2">
                        <strong>{analytics.membersSharingSameShift}</strong> team member{analytics.membersSharingSameShift !== 1 ? 's' : ''} 
                        {' '}with the <strong>same working days pattern</strong> and <strong>shift type</strong> need to coordinate use of 
                        {' '}<strong>{analytics.usableDays ?? 0}</strong> available days.
                      </p>
                      <p className="text-sm text-blue-700 mb-1">
                        With {analytics.membersSharingSameShift} members competing for {analytics.usableDays ?? 0} days:
                      </p>
                      <p className="text-sm text-blue-700 font-medium">
                        Realistic usable days per member: <strong>{analytics.realisticUsableDays ?? 0}</strong> days 
                        ({analytics.averageDaysPerMember} average)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* High Competition Warning */}
              {analytics.averageDaysPerMember < analytics.remainingLeaveBalance * 0.5 && (
                <div className="card border-2 border-red-300 bg-red-50 mb-6">
                  <div className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-lg">⚠</span>
                      </div>
                      <div>
                        <p className="font-semibold text-red-900 mb-1">High Demand Alert</p>
                        <p className="text-sm text-red-700">
                          You have <strong>{analytics.remainingLeaveBalance}</strong> leave days remaining, but on average only <strong>{analytics.averageDaysPerMember}</strong> days per member are available.
                          Consider coordinating with your team members to avoid conflicts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Availability Warning */}
              {analytics.usableDays < analytics.theoreticalWorkingDays && (
                <div className="card border-2 border-orange-300 bg-orange-50 mb-6">
                  <div className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-lg">⚠</span>
                      </div>
                      <div>
                        <p className="font-semibold text-orange-900 mb-1">Concurrent Leave Constraint</p>
                        <p className="text-sm text-orange-700">
                          Due to concurrent leave limits, you have <strong>{analytics.usableDays ?? 0}</strong> usable days of <strong>{analytics.theoreticalWorkingDays}</strong> remaining working days.
                          {analytics.usableDays < analytics.theoreticalWorkingDays && (
                            <> Some days are already booked by other team members.</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Carryover/Loss Card */}
              <div className={`card card-hover slide-up ${analytics.willLose > 0 ? 'border-2 border-red-300 bg-red-50' : analytics.willCarryover > 0 ? 'border-2 border-green-300 bg-green-50' : 'border-2 border-gray-300'}`} style={{ animationDelay: '0.2s' }}>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Year-End Outlook</h3>
                  
                  {analytics.allowCarryover ? (
                    <div>
                      {analytics.willCarryover > 0 ? (
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">✓</span>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-700">{analytics.willCarryover} days</p>
                            <p className="text-sm text-green-600">will carry over to next year</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-gray-400 to-gray-500 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">✓</span>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-700">No days to carry over</p>
                            <p className="text-sm text-gray-600">All leave will be used or retained</p>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-4">
                        Your team allows leave carryover. Unused days will be available next year.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {analytics.willLose > 0 ? (
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">⚠</span>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-red-700">{analytics.willLose} days</p>
                            <p className="text-sm text-red-600">will be lost at year end</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-500 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">✓</span>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-green-700">No days will be lost</p>
                            <p className="text-sm text-green-600">All remaining leave can be used</p>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-4">
                        Your team does not allow leave carryover. Unused days will be lost at year end.
                      </p>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="mt-6">
                    <div className="flex justify-between text-xs text-gray-600 mb-2">
                      <span>Leave Usage</span>
                      <span>{analytics.workingDaysUsed} / {analytics.workingDaysInYear} working days</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (analytics.workingDaysUsed / analytics.workingDaysInYear) * 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {((analytics.workingDaysUsed / analytics.workingDaysInYear) * 100).toFixed(1)}% of working days used this year
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Requests */}
          <div className="card card-hover bounce-in">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  My Recent Requests
                </h3>
                <a
                  href="/member/requests"
                  className="btn-primary text-sm py-2 px-4"
                >
                  View All →
                </a>
              </div>
              {myRequests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-gray-500 text-lg mb-4">No requests yet</p>
                  <a href="/member/requests" className="btn-primary">
                    Create Your First Request
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  {myRequests.slice(0, 5).map((request, index) => (
                    <div key={request._id} className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:border-gray-300 transition-all duration-200" style={{ animationDelay: `${index * 0.1}s` }}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            📅 {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                          </p>
                          <p className="text-gray-700 font-medium mb-1">{request.reason}</p>
                          <p className="text-xs text-gray-500">
                            📅 Requested on {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
