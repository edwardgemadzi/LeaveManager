'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, User, LeaveRequest } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance } from '@/lib/leaveCalculations';

export default function LeaderLeaveBalancePage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'used'>('name');
  const [filterBy, setFilterBy] = useState<'all' | 'low' | 'high'>('all');
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [tempBalance, setTempBalance] = useState<string>('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Extract fetchData function to be reusable
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || '{}');

      if (!user.teamId) {
        console.error('No team ID found');
        return;
      }

      // Fetch team data
      const teamResponse = await fetch('/api/team', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!teamResponse.ok) {
        console.error('Failed to fetch team data:', teamResponse.status);
        return;
      }
      
      const teamData = await teamResponse.json();
      setTeam(teamData.team);
      setMembers(teamData.members || []);

      // Fetch all requests
      const requestsResponse = await fetch('/api/leave-requests', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (requestsResponse.ok) {
        const requests = await requestsResponse.json();
        setAllRequests(requests || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh on window focus to get updated data after deletions
  useEffect(() => {
    const handleFocus = () => {
      // Refetch data when window regains focus
      fetchData();
    };

    const handleRequestDeleted = () => {
      // Refetch data immediately when a request is deleted
      fetchData();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('leaveRequestDeleted', handleRequestDeleted);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('leaveRequestDeleted', handleRequestDeleted);
    };
  }, []);

  const getMemberLeaveData = (member: User) => {
    const memberRequests = allRequests.filter(req => req.userId === member._id);
    const approvedRequests = memberRequests.filter(req => req.status === 'approved');
    
    const shiftSchedule = member.shiftSchedule || {
      pattern: [true, true, true, true, true, false, false],
      startDate: new Date(),
      type: 'fixed'
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    yearEnd.setHours(23, 59, 59, 999);

    // Calculate total working days in year
    const totalWorkingDaysInYear = countWorkingDays(yearStart, yearEnd, shiftSchedule);
    
    // Calculate working days used year-to-date
    const yearToDateWorkingDays = approvedRequests.reduce((total, req) => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      
      // Only count days up to today
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const actualEnd = end > todayDate ? todayDate : end;
      
      if (actualEnd >= start) {
        return total + countWorkingDays(start, actualEnd, shiftSchedule);
      }
      return total;
    }, 0);

    // Calculate remaining balance
    const approvedRequestsForCalculation = approvedRequests.map(req => ({
      startDate: new Date(req.startDate),
      endDate: new Date(req.endDate)
    }));
    
    const remainingBalance = calculateLeaveBalance(
      team?.settings.maxLeavePerYear || 20,
      approvedRequestsForCalculation,
      shiftSchedule,
      member.manualLeaveBalance
    );

    // Calculate total days used (all time, not just this year)
    const totalUsed = approvedRequests.reduce((total, req) => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      return total + countWorkingDays(start, end, shiftSchedule);
    }, 0);

    // Calculate percentage used
    const maxLeave = team?.settings.maxLeavePerYear || 20;
    const percentageUsed = maxLeave > 0 ? (totalUsed / maxLeave) * 100 : 0;

    // Calculate surplus balance
    const surplusBalance = calculateSurplusBalance(member.manualLeaveBalance, maxLeave);

    return {
      remainingBalance,
      totalUsed,
      yearToDateUsed: yearToDateWorkingDays,
      totalWorkingDaysInYear,
      percentageUsed,
      surplusBalance,
      approvedCount: approvedRequests.length,
      pendingCount: memberRequests.filter(req => req.status === 'pending').length,
      rejectedCount: memberRequests.filter(req => req.status === 'rejected').length,
    };
  };

  const getSortedAndFilteredMembers = () => {
    let memberList = members.filter(m => m.role === 'member');
    
    // Calculate leave data for each member
    const membersWithData = memberList.map(member => ({
      member,
      leaveData: getMemberLeaveData(member),
    }));

    // Filter
    if (filterBy === 'low') {
      memberList = membersWithData
        .filter(m => m.leaveData.remainingBalance < (team?.settings.maxLeavePerYear || 20) * 0.3)
        .map(m => m.member);
    } else if (filterBy === 'high') {
      memberList = membersWithData
        .filter(m => m.leaveData.remainingBalance >= (team?.settings.maxLeavePerYear || 20) * 0.7)
        .map(m => m.member);
    } else {
      memberList = memberList;
    }

    // Sort
    const membersWithDataForSort = membersWithData.filter(m => memberList.includes(m.member));
    if (sortBy === 'name') {
      return membersWithDataForSort.sort((a, b) => 
        (a.member.fullName || a.member.username).localeCompare(b.member.fullName || b.member.username)
      ).map(m => m.member);
    } else if (sortBy === 'balance') {
      return membersWithDataForSort.sort((a, b) => 
        b.leaveData.remainingBalance - a.leaveData.remainingBalance
      ).map(m => m.member);
    } else if (sortBy === 'used') {
      return membersWithDataForSort.sort((a, b) => 
        b.leaveData.totalUsed - a.leaveData.totalUsed
      ).map(m => m.member);
    }

    return memberList;
  };

  const handleEditBalance = (member: User) => {
    setEditingBalance(member._id || null);
    // Get current remaining balance to show in the input
    const leaveData = getMemberLeaveData(member);
    setTempBalance(leaveData.remainingBalance.toFixed(1));
  };

  const handleSaveBalance = async (memberId: string) => {
    const member = members.find(m => m._id === memberId);
    if (!member) return;

    const balanceValue = parseFloat(tempBalance);
    if (isNaN(balanceValue) || balanceValue < 0) {
      alert('Please enter a valid non-negative number');
      return;
    }

    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      
      // Calculate the manual balance by adding back the approved requests
      const memberRequests = allRequests.filter(req => req.userId === memberId);
      const approvedRequests = memberRequests.filter(req => req.status === 'approved');
      
      const shiftSchedule = member.shiftSchedule || {
        pattern: [true, true, true, true, true, false, false],
        startDate: new Date(),
        type: 'fixed'
      };
      
      const currentYear = new Date().getFullYear();
      const approvedWorkingDays = approvedRequests
        .filter(req => new Date(req.startDate).getFullYear() === currentYear)
        .reduce((total, req) => {
          const workingDays = countWorkingDays(
            new Date(req.startDate),
            new Date(req.endDate),
            shiftSchedule
          );
          return total + workingDays;
        }, 0);
      
      // Manual balance = desired remaining balance + approved working days
      const manualBalance = balanceValue + approvedWorkingDays;
      
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ manualLeaveBalance: manualBalance }),
      });

      if (response.ok) {
        // Update member in state
        setMembers(members.map(m => 
          m._id === memberId 
            ? { ...m, manualLeaveBalance: manualBalance }
            : m
        ));
        setEditingBalance(null);
        setTempBalance('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update leave balance');
      }
    } catch (error) {
      console.error('Error updating leave balance:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingBalance(null);
    setTempBalance('');
  };

  const handleResetBalance = async (memberId: string) => {
    if (!confirm('Reset balance to auto-calculated? This will remove the manual override.')) {
      return;
    }

    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ manualLeaveBalance: null }),
      });

      if (response.ok) {
        // Update member in state - remove manualLeaveBalance
        setMembers(members.map(m => {
          if (m._id === memberId) {
            const updated = { ...m };
            delete updated.manualLeaveBalance;
            return updated;
          }
          return m;
        }));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to reset leave balance');
      }
    } catch (error) {
      console.error('Error resetting leave balance:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading leave balances...</p>
          </div>
        </div>
      </div>
    );
  }

  const memberList = getSortedAndFilteredMembers();
  const allMembersData = members.filter(m => m.role === 'member').map(m => ({
    member: m,
    leaveData: getMemberLeaveData(m),
  }));

  const totalMembers = allMembersData.length;
  const totalRemainingBalance = allMembersData.reduce((sum, m) => sum + m.leaveData.remainingBalance, 0);
  const totalUsed = allMembersData.reduce((sum, m) => sum + m.leaveData.totalUsed, 0);
  const averageBalance = totalMembers > 0 ? totalRemainingBalance / totalMembers : 0;

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
          <div className="px-4 py-6 sm:px-0 mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Detailed Leave Balance</h1>
            <p className="mt-2 text-gray-600">View comprehensive leave balance information for all team members.</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 text-xl">👥</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900">{totalMembers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 text-xl">📅</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Remaining</p>
                  <p className="text-2xl font-bold text-gray-900">{totalRemainingBalance.toFixed(1)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <span className="text-yellow-600 text-xl">📊</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Used</p>
                  <p className="text-2xl font-bold text-gray-900">{totalUsed.toFixed(1)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 text-xl">📈</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Avg Balance</p>
                  <p className="text-2xl font-bold text-gray-900">{averageBalance.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Sort */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Filter:</label>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as 'all' | 'low' | 'high')}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Members</option>
                  <option value="low">Low Balance (&lt;30%)</option>
                  <option value="high">High Balance (&gt;=70%)</option>
                </select>
              </div>

              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'balance' | 'used')}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="name">Name</option>
                  <option value="balance">Remaining Balance</option>
                  <option value="used">Days Used</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Member
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Year-to-Date Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requests
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {memberList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No members found
                      </td>
                    </tr>
                  ) : (
                    memberList.map((member) => {
                      const leaveData = getMemberLeaveData(member);
                      const maxLeave = team?.settings.maxLeavePerYear || 20;
                      const percentageColor = leaveData.percentageUsed > 80 
                        ? 'text-red-600' 
                        : leaveData.percentageUsed > 60 
                        ? 'text-orange-600' 
                        : 'text-green-600';

                      return (
                        <tr key={member._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {member.fullName || member.username}
                                </div>
                                <div className="text-sm text-gray-500">{member.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingBalance === member._id ? (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={tempBalance}
                                    onChange={(e) => setTempBalance(e.target.value)}
                                    disabled={updating === member._id}
                                    className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveBalance(member._id!);
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <span className="text-sm text-gray-500">/ {maxLeave}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleSaveBalance(member._id!)}
                                    disabled={updating === member._id}
                                    className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                                  >
                                    {updating === member._id ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={updating === member._id}
                                    className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {member.manualLeaveBalance !== undefined && (
                                  <p className="text-xs text-blue-600">
                                    Base balance: {member.manualLeaveBalance.toFixed(1)} days
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="group">
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="text-sm font-medium text-gray-900 cursor-pointer hover:text-indigo-600"
                                    onClick={() => handleEditBalance(member)}
                                    title="Click to edit balance"
                                  >
                                    {leaveData.remainingBalance.toFixed(1)} / {maxLeave}
                                    {leaveData.surplusBalance > 0 && (
                                      <span className="ml-2 text-xs text-green-600" title="Surplus balance">
                                        (+{leaveData.surplusBalance.toFixed(1)} surplus)
                                      </span>
                                    )}
                                    {member.manualLeaveBalance !== undefined && (
                                      <span className="ml-2 text-xs text-blue-600" title="Manual balance override">✏️</span>
                                    )}
                                  </div>
                                  {leaveData.surplusBalance > 0 && (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        +{leaveData.surplusBalance.toFixed(1)} surplus days
                                      </span>
                                    </div>
                                  )}
                                  {member.manualLeaveBalance !== undefined && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResetBalance(member._id!);
                                      }}
                                      disabled={updating === member._id}
                                      className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                                      title="Reset to auto-calculated"
                                    >
                                      ↺
                                    </button>
                                  )}
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                  <div
                                    className={`h-2 rounded-full ${
                                      leaveData.remainingBalance < maxLeave * 0.3
                                        ? 'bg-red-500'
                                        : leaveData.remainingBalance < maxLeave * 0.7
                                        ? 'bg-yellow-500'
                                        : 'bg-green-500'
                                    }`}
                                    style={{
                                      width: `${Math.min((leaveData.remainingBalance / maxLeave) * 100, 100)}%`
                                    }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {leaveData.totalUsed.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {leaveData.yearToDateUsed.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-medium ${percentageColor}`}>
                              {leaveData.percentageUsed.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center space-x-2">
                              <span className="text-green-600">{leaveData.approvedCount} approved</span>
                              <span className="text-yellow-600">{leaveData.pendingCount} pending</span>
                              {leaveData.rejectedCount > 0 && (
                                <span className="text-red-600">{leaveData.rejectedCount} rejected</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

