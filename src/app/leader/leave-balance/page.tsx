'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, User, LeaveRequest } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance } from '@/lib/leaveCalculations';
import { calculateUsableDays, calculateMembersSharingSameShift } from '@/lib/analyticsCalculations';
import { UsersIcon, CalendarIcon, ChartBarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

export default function LeaderLeaveBalancePage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'used'>('name');
  const [filterBy, setFilterBy] = useState<'all' | 'low' | 'high'>('all');
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [tempBalance, setTempBalance] = useState<string>('');
  const [editingDaysTaken, setEditingDaysTaken] = useState<string | null>(null);
  const [tempDaysTaken, setTempDaysTaken] = useState<string>('');
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
    
    // Use manualYearToDateUsed if set, otherwise use calculated value
    const yearToDateUsed = member.manualYearToDateUsed !== undefined 
      ? member.manualYearToDateUsed 
      : yearToDateWorkingDays;
    
    const remainingBalance = calculateLeaveBalance(
      team?.settings.maxLeavePerYear || 20,
      approvedRequestsForCalculation,
      shiftSchedule,
      member.manualLeaveBalance,
      member.manualYearToDateUsed
    );

    // Calculate total days used (all time, not just this year)
    // First, calculate total from all approved requests
    const totalFromAllRequests = approvedRequests.reduce((total, req) => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      return total + countWorkingDays(start, end, shiftSchedule);
    }, 0);
    
    // If manualYearToDateUsed is set, replace the current year's year-to-date portion with manual value
    // Total = (all approved requests) - (calculated current year year-to-date days) + (manualYearToDateUsed)
    // We use yearToDateWorkingDays which already calculates only up to today
    const totalUsed = member.manualYearToDateUsed !== undefined
      ? totalFromAllRequests - yearToDateWorkingDays + member.manualYearToDateUsed
      : totalFromAllRequests;

    // Calculate percentage used - use year-to-date used, not total used
    const maxLeave = team?.settings.maxLeavePerYear || 20;
    // Calculate base balance (manualLeaveBalance if set, otherwise maxLeavePerYear)
    const baseBalance = member.manualLeaveBalance !== undefined ? member.manualLeaveBalance : maxLeave;
    // If base is 0, percentage should be null (display as "-")
    const percentageUsed = baseBalance > 0 ? (yearToDateUsed / baseBalance) * 100 : null;

    // Calculate surplus balance
    const surplusBalance = calculateSurplusBalance(member.manualLeaveBalance, maxLeave);

    // Filter out members with 0 base balance from realistic calculations
    // Members with 0 base balance should not affect competition/realistic calculations
    const membersWithNonZeroBase = members.filter(m => {
      const memberBaseBalance = m.manualLeaveBalance !== undefined 
        ? m.manualLeaveBalance 
        : (team?.settings.maxLeavePerYear || 20);
      return memberBaseBalance > 0;
    });
    
    // Calculate realistic usable days (factors in members sharing same schedule)
    const membersSharingSameShift = calculateMembersSharingSameShift(member, membersWithNonZeroBase);
    const usableDays = team ? calculateUsableDays(
      member,
      team,
      allRequests.filter(req => req.status === 'approved'),
      membersWithNonZeroBase,
      shiftSchedule
    ) : 0;
    
    // Realistic usable days divides usable days by members sharing the same shift, capped by remaining leave balance
    const realisticUsableDays = membersSharingSameShift > 0
      ? Math.min(
          Math.round((usableDays / membersSharingSameShift) * 10) / 10,
          remainingBalance
        )
      : Math.min(usableDays, remainingBalance);

    // Calculate willLoseDays (days that will be lost if realisticUsableDays < remainingBalance)
    const willLoseDays = realisticUsableDays < remainingBalance
      ? remainingBalance - realisticUsableDays
      : 0;

    return {
      remainingBalance,
      totalUsed,
      yearToDateUsed,
      totalWorkingDaysInYear,
      percentageUsed,
      surplusBalance,
      realisticUsableDays,
      willLoseDays,
      approvedCount: approvedRequests.length,
      pendingCount: memberRequests.filter(req => req.status === 'pending').length,
      rejectedCount: memberRequests.filter(req => req.status === 'rejected').length,
      baseBalance
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
    setTempBalance(Math.round(leaveData.remainingBalance).toString());
  };

  const handleSaveBalance = async (memberId: string) => {
    const member = members.find(m => m._id === memberId);
    if (!member) return;

    const balanceValue = Math.floor(parseFloat(tempBalance));
    if (isNaN(balanceValue) || balanceValue < 0) {
      alert('Please enter a valid non-negative whole number');
      return;
    }

    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const maxLeave = team?.settings.maxLeavePerYear || 20;
      
      // Get days used - use manualYearToDateUsed if set, otherwise calculate from approved requests
      let daysUsed: number;
      if (member.manualYearToDateUsed !== undefined) {
        daysUsed = member.manualYearToDateUsed;
      } else {
        const memberRequests = allRequests.filter(req => req.userId === memberId);
        const approvedRequests = memberRequests.filter(req => req.status === 'approved');
        
        const shiftSchedule = member.shiftSchedule || {
          pattern: [true, true, true, true, true, false, false],
          startDate: new Date(),
          type: 'fixed'
        };
        
        const currentYear = new Date().getFullYear();
        const yearStart = new Date(currentYear, 0, 1);
        yearStart.setHours(0, 0, 0, 0);
        const yearEnd = new Date(currentYear, 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        
        daysUsed = approvedRequests.reduce((total, req) => {
          const reqStart = new Date(req.startDate);
          const reqEnd = new Date(req.endDate);
          reqStart.setHours(0, 0, 0, 0);
          reqEnd.setHours(23, 59, 59, 999);
          
          if (reqStart <= yearEnd && reqEnd >= yearStart) {
            const overlapStart = reqStart > yearStart ? reqStart : yearStart;
            const overlapEnd = reqEnd < yearEnd ? reqEnd : yearEnd;
            const workingDays = countWorkingDays(overlapStart, overlapEnd, shiftSchedule);
            return total + workingDays;
          }
          return total;
        }, 0);
      }
      
      // If balanceValue is less than maxLeavePerYear, set it as the base for that year
      // Otherwise, calculate what manualLeaveBalance should be to achieve desired remaining balance
      let manualBalance: number;
      if (balanceValue < maxLeave) {
        // The entered remaining balance becomes the base for that year
        manualBalance = balanceValue;
      } else {
        // Calculate what manualLeaveBalance should be to achieve desired remaining balance
        // Formula: remainingBalance = manualLeaveBalance - daysUsed
        // So: manualLeaveBalance = desiredRemaining + daysUsed
        manualBalance = balanceValue + daysUsed;
      }
      
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

  const handleEditDaysTaken = (member: User) => {
    setEditingDaysTaken(member._id || null);
    // Get current year-to-date used to show in the input
    const leaveData = getMemberLeaveData(member);
    setTempDaysTaken(Math.round(leaveData.yearToDateUsed).toString());
  };

  const handleSaveDaysTaken = async (memberId: string) => {
    const member = members.find(m => m._id === memberId);
    if (!member) return;

    const daysTakenValue = Math.floor(parseFloat(tempDaysTaken));
    if (isNaN(daysTakenValue) || daysTakenValue < 0) {
      alert('Please enter a valid non-negative whole number');
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
        body: JSON.stringify({ manualYearToDateUsed: daysTakenValue }),
      });

      if (response.ok) {
        // Update member in state
        setMembers(members.map(m => 
          m._id === memberId 
            ? { ...m, manualYearToDateUsed: daysTakenValue }
            : m
        ));
        setEditingDaysTaken(null);
        setTempDaysTaken('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update days taken');
      }
    } catch (error) {
      console.error('Error updating days taken:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEditDaysTaken = () => {
    setEditingDaysTaken(null);
    setTempDaysTaken('');
  };

  const handleResetDaysTaken = async (memberId: string) => {
    if (!confirm('Reset days taken to auto-calculated? This will remove the manual override.')) {
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
        body: JSON.stringify({ manualYearToDateUsed: null }),
      });

      if (response.ok) {
        // Update member in state - remove manualYearToDateUsed
        setMembers(members.map(m => {
          if (m._id === memberId) {
            const updated = { ...m };
            delete updated.manualYearToDateUsed;
            return updated;
          }
          return m;
        }));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to reset days taken');
      }
    } catch (error) {
      console.error('Error resetting days taken:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
            <div className="flex items-center justify-center h-64 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Loading leave balances...</p>
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

  // Filter out members with 0 base balance from aggregate calculations
  const membersWithNonZeroBase = allMembersData.filter(m => {
    const baseBalance = m.member.manualLeaveBalance !== undefined 
      ? m.member.manualLeaveBalance 
      : (team?.settings.maxLeavePerYear || 20);
    return baseBalance > 0;
  });
  
  const totalMembers = allMembersData.length;
  const totalRemainingBalance = membersWithNonZeroBase.reduce((sum, m) => sum + m.leaveData.remainingBalance, 0);
  const totalUsed = membersWithNonZeroBase.reduce((sum, m) => sum + m.leaveData.totalUsed, 0);
  const averageBalance = membersWithNonZeroBase.length > 0 ? totalRemainingBalance / membersWithNonZeroBase.length : 0;

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
          <div className="px-4 py-6 sm:px-0 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Detailed Leave Balance</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">View comprehensive leave balance information for all team members.</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <UsersIcon className="h-6 w-6 text-blue-700 dark:text-blue-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalMembers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <CalendarIcon className="h-6 w-6 text-green-700 dark:text-green-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Remaining</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalRemainingBalance)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="h-6 w-6 text-yellow-700 dark:text-yellow-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Used</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totalUsed)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <ArrowTrendingUpIcon className="h-6 w-6 text-purple-700 dark:text-purple-400" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Balance</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(averageBalance)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Sort */}
          <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-4 mb-6 border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</label>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as 'all' | 'low' | 'high')}
                  className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                >
                  <option value="all">All Members</option>
                  <option value="low">Low Balance (&lt;30%)</option>
                  <option value="high">High Balance (&gt;=70%)</option>
                </select>
              </div>

              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'balance' | 'used')}
                  className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                >
                  <option value="name">Name</option>
                  <option value="balance">Remaining Balance</option>
                  <option value="used">Days Used</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-white dark:bg-gray-900 shadow rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Member
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Remaining Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Total Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Year-to-Date Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Usage %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Requests
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {memberList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        No members found
                      </td>
                    </tr>
                  ) : (
                    memberList.map((member) => {
                      const leaveData = getMemberLeaveData(member);
                      const maxLeave = team?.settings.maxLeavePerYear || 20;
                      
                      // Color based on realistic usable days vs remaining balance
                      // Green when realisticUsableDays >= remainingBalance (can use all days)
                      // Red/yellow when realisticUsableDays < remainingBalance (will lose days)
                      let percentageColor: string;
                      if (leaveData.realisticUsableDays >= leaveData.remainingBalance) {
                        percentageColor = 'text-green-600 dark:text-green-400'; // Good - can use all days
                      } else {
                        const realisticPercentage = leaveData.remainingBalance > 0
                          ? (leaveData.realisticUsableDays / leaveData.remainingBalance) * 100
                          : 0;
                        if (realisticPercentage < 30) {
                          percentageColor = 'text-red-600 dark:text-red-400'; // Very bad - will lose most days
                        } else if (realisticPercentage < 70) {
                          percentageColor = 'text-orange-600 dark:text-orange-400'; // Moderate - will lose some days
                        } else {
                          percentageColor = 'text-red-500 dark:text-red-400'; // Bad - will lose some days
                        }
                      }

                      return (
                        <tr key={member._id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {member.fullName || member.username}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">{member.username}</div>
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
                                    step="1"
                                    value={tempBalance}
                                    onChange={(e) => setTempBalance(e.target.value)}
                                    disabled={updating === member._id}
                                    className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveBalance(member._id!);
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <span className="text-sm text-gray-500 dark:text-gray-400">/ {maxLeave}</span>
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
                                  <p className="text-xs text-blue-600 dark:text-blue-400">
                                    Base balance: {Math.round(member.manualLeaveBalance)} days
                                    {member.manualLeaveBalance < maxLeave && (
                                      <span className="ml-1 text-red-600 dark:text-red-400">
                                        ({Math.round(maxLeave - member.manualLeaveBalance)} less than team standard of {maxLeave})
                                      </span>
                                    )}
                                    {member.manualLeaveBalance > maxLeave && (
                                      <span className="ml-1 text-green-600 dark:text-green-400">
                                        (+{Math.round(member.manualLeaveBalance - maxLeave)} surplus)
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="group">
                                <div className="flex flex-col space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <div 
                                      className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                                      onClick={() => handleEditBalance(member)}
                                      title="Click to edit balance"
                                    >
                                      {(() => {
                                        const baseBalance = member.manualLeaveBalance !== undefined 
                                          ? member.manualLeaveBalance 
                                          : maxLeave;
                                        if (baseBalance === 0) {
                                          return <>0 / 0</>;
                                        }
                                        return <>{Math.round(leaveData.remainingBalance)} / {maxLeave}</>;
                                      })()}
                                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(remaining)</span>
                                      {leaveData.surplusBalance > 0 && (
                                        <span className="ml-2 text-xs text-green-600 dark:text-green-400" title="Surplus balance">
                                          (+{Math.round(leaveData.surplusBalance)} surplus)
                                        </span>
                                      )}
                                      {member.manualLeaveBalance !== undefined && (
                                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400" title="Manual balance override">✏️</span>
                                      )}
                                    </div>
                                    {member.manualLeaveBalance !== undefined && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResetBalance(member._id!);
                                        }}
                                        disabled={updating === member._id}
                                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                        title="Reset to auto-calculated"
                                      >
                                        ↺
                                      </button>
                                    )}
                                  </div>
                                  {member.manualLeaveBalance !== undefined && Math.round(member.manualLeaveBalance) !== Math.round(leaveData.remainingBalance) && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      <span className="font-medium">Base balance:</span> {Math.round(member.manualLeaveBalance)} days
                                      {member.manualLeaveBalance < maxLeave && (
                                        <span className="ml-2 text-red-600 dark:text-red-400">
                                          ({Math.round(maxLeave - member.manualLeaveBalance)} less than team standard of {maxLeave})
                                        </span>
                                      )}
                                      {member.manualLeaveBalance > maxLeave && (
                                        <span className="ml-2 text-green-600 dark:text-green-400">
                                          (+{Math.round(member.manualLeaveBalance - maxLeave)} surplus)
                                        </span>
                                      )}
                                      <span className="ml-2 text-gray-500 dark:text-gray-400">
                                        ({Math.round(member.manualLeaveBalance - leaveData.remainingBalance)} days used)
                                      </span>
                                    </div>
                                  )}
                                  {leaveData.surplusBalance > 0 && (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                        +{Math.round(leaveData.surplusBalance)} surplus days
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 mt-1">
                                  <div
                                    className={`h-2 rounded-full ${
                                      leaveData.realisticUsableDays >= leaveData.remainingBalance
                                        ? 'bg-green-500' // Good - can use all days
                                        : (() => {
                                            const realisticPercentage = leaveData.remainingBalance > 0
                                              ? (leaveData.realisticUsableDays / leaveData.remainingBalance) * 100
                                              : 0;
                                            if (realisticPercentage < 30) {
                                              return 'bg-red-600'; // Very bad - will lose most days
                                            } else if (realisticPercentage < 70) {
                                              return 'bg-yellow-500'; // Moderate - will lose some days
                                            } else {
                                              return 'bg-red-500'; // Bad - will lose some days
                                            }
                                          })()
                                    }`}
                                    style={{
                                      width: `${Math.min((leaveData.remainingBalance / maxLeave) * 100, 100)}%`
                                    }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {leaveData.baseBalance > 0 ? Math.round(leaveData.totalUsed) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingDaysTaken === member._id ? (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={tempDaysTaken}
                                  onChange={(e) => setTempDaysTaken(e.target.value)}
                                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveDaysTaken(member._id!)}
                                  disabled={updating === member._id}
                                  className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEditDaysTaken}
                                  disabled={updating === member._id}
                                  className="text-xs px-2 py-1 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="group">
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="text-sm text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                                    onClick={() => handleEditDaysTaken(member)}
                                    title="Click to edit days taken"
                                  >
                                    {leaveData.baseBalance > 0 ? Math.round(leaveData.yearToDateUsed) : '-'}
                                    {member.manualYearToDateUsed !== undefined && leaveData.baseBalance > 0 && (
                                      <span className="ml-1 text-xs text-blue-600 dark:text-blue-400" title="Manual override">✏️</span>
                                    )}
                                  </div>
                                  {member.manualYearToDateUsed !== undefined && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResetDaysTaken(member._id!);
                                      }}
                                      disabled={updating === member._id}
                                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                      title="Reset to auto-calculated"
                                    >
                                      ↺
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-medium ${percentageColor}`}>
                              {leaveData.percentageUsed !== null ? `${Math.round(leaveData.percentageUsed)}%` : '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center space-x-2">
                              <span className="text-green-600 dark:text-green-400">{leaveData.approvedCount} approved</span>
                              <span className="text-yellow-600 dark:text-yellow-400">{leaveData.pendingCount} pending</span>
                              {leaveData.rejectedCount > 0 && (
                                <span className="text-red-600 dark:text-red-400">{leaveData.rejectedCount} rejected</span>
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

