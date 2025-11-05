'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { Team, User, LeaveRequest } from '@/types';
import { calculateLeaveBalance, countWorkingDays, calculateSurplusBalance, calculateMaternityLeaveBalance, calculateMaternitySurplusBalance, isMaternityLeave, countMaternityLeaveDays } from '@/lib/leaveCalculations';
import { calculateUsableDays, calculateMembersSharingSameShift, GroupedTeamAnalytics, MemberAnalytics } from '@/lib/analyticsCalculations';
import { UsersIcon, CalendarIcon, ChartBarIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

export default function LeaderLeaveBalancePage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [analytics, setAnalytics] = useState<GroupedTeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'used'>('name');
  const [filterBy, setFilterBy] = useState<'all' | 'low' | 'high'>('all');
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [tempBalance, setTempBalance] = useState<string>('');
  const [editingDaysTaken, setEditingDaysTaken] = useState<string | null>(null);
  const [tempDaysTaken, setTempDaysTaken] = useState<string>('');
  const [editingMaternityBalance, setEditingMaternityBalance] = useState<string | null>(null);
  const [tempMaternityBalance, setTempMaternityBalance] = useState<string>('');
  const [editingMaternityDaysTaken, setEditingMaternityDaysTaken] = useState<string | null>(null);
  const [tempMaternityDaysTaken, setTempMaternityDaysTaken] = useState<string>('');
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

      // Fetch all data in parallel
      const [teamResponse, requestsResponse, analyticsResponse] = await Promise.all([
        fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch('/api/leave-requests', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch('/api/analytics', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
      ]);
      
      // Process team response
      if (!teamResponse.ok) {
        console.error('Failed to fetch team data:', teamResponse.status);
      } else {
        const teamData = await teamResponse.json();
        setTeam(teamData.team);
        setMembers(teamData.members || []);
      }

      // Process requests response
      if (requestsResponse.ok) {
        const requests = await requestsResponse.json();
        setAllRequests(requests || []);
      }

      // Process analytics response
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        const groupedData = analyticsData.analytics || analyticsData.grouped || null;
        if (groupedData) {
          setAnalytics(groupedData);
        }
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

  // Helper function to find member analytics data from grouped analytics
  const getMemberAnalyticsData = (member: User): MemberAnalytics | null => {
    if (!analytics || !analytics.groups) return null;
    
    const memberId = member._id?.toString() || '';
    for (const group of analytics.groups) {
      const memberAnalytics = group.members.find(m => m.userId === memberId);
      if (memberAnalytics) {
        return memberAnalytics.analytics;
      }
    }
    return null;
  };

  const getMemberLeaveData = (member: User) => {
    const memberRequests = allRequests.filter(req => req.userId === member._id);
    // Filter out maternity leave requests from regular leave calculations
    const approvedRequests = memberRequests.filter(req => 
      req.status === 'approved' && (!req.reason || !isMaternityLeave(req.reason))
    );
    
    // Debug logging for specific user
    if (member.username === 'iguimbi') {
      console.log('[DEBUG iguimbi] Member requests:', memberRequests.length);
      console.log('[DEBUG iguimbi] Approved requests (non-maternity):', approvedRequests.length);
      console.log('[DEBUG iguimbi] Manual leave balance:', member.manualLeaveBalance);
      console.log('[DEBUG iguimbi] Manual year-to-date used:', member.manualYearToDateUsed);
      approvedRequests.forEach((req, idx) => {
        console.log(`[DEBUG iguimbi] Request ${idx + 1}:`, {
          startDate: req.startDate,
          endDate: req.endDate,
          reason: req.reason,
          status: req.status
        });
      });
    }
    
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
    // Count all approved days in the current year (including future approved dates)
    // because approved requests are already committed/allocated
    const yearToDateWorkingDays = approvedRequests.reduce((total, req) => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      // Only count days within the current year
      if (start <= yearEnd && end >= yearStart) {
        const overlapStart = start > yearStart ? start : yearStart;
        const overlapEnd = end < yearEnd ? end : yearEnd;
        
        if (overlapEnd >= overlapStart) {
          return total + countWorkingDays(overlapStart, overlapEnd, shiftSchedule);
        }
      }
      return total;
    }, 0);

    // Use manualYearToDateUsed if set, otherwise use calculated value
    const yearToDateUsed = member.manualYearToDateUsed !== undefined 
      ? member.manualYearToDateUsed 
      : yearToDateWorkingDays;

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

    // Try to use analytics data first, fallback to calculation if not available
    const analyticsData = getMemberAnalyticsData(member);
    
    // Calculate remaining balance (needed for fallback)
    // Include reason field so calculateLeaveBalance can filter out maternity leave
    const approvedRequestsForCalculation = approvedRequests.map(req => ({
      startDate: new Date(req.startDate),
      endDate: new Date(req.endDate),
      reason: req.reason
    }));
    
    const remainingBalance = analyticsData?.remainingLeaveBalance ?? calculateLeaveBalance(
      team?.settings.maxLeavePerYear || 20,
      approvedRequestsForCalculation,
      shiftSchedule,
      member.manualLeaveBalance,
      member.manualYearToDateUsed
    );

    // Use analytics data if available, otherwise calculate
    const surplusBalance = analyticsData?.surplusBalance ?? calculateSurplusBalance(member.manualLeaveBalance, maxLeave);
    const realisticUsableDays = analyticsData?.realisticUsableDays ?? (() => {
      // Fallback calculation if analytics not available
      const membersWithNonZeroBase = members.filter(m => {
        const memberBaseBalance = m.manualLeaveBalance !== undefined 
          ? m.manualLeaveBalance 
          : (team?.settings.maxLeavePerYear || 20);
        return memberBaseBalance > 0;
      });
      
      const membersSharingSameShift = calculateMembersSharingSameShift(member, membersWithNonZeroBase);
      const usableDays = team ? calculateUsableDays(
        member,
        team,
        allRequests.filter(req => req.status === 'approved'),
        membersWithNonZeroBase,
        shiftSchedule
      ) : 0;
      
      return membersSharingSameShift > 0
        ? Math.min(
            Math.floor(usableDays / membersSharingSameShift),
            remainingBalance
          )
        : Math.min(usableDays, remainingBalance);
    })();
    
    const willLoseDays = analyticsData?.willLose ?? (realisticUsableDays < remainingBalance
      ? remainingBalance - realisticUsableDays
      : 0);
    
    const remainderDays = analyticsData?.remainderDays ?? 0;
    const membersSharingSameShift = analyticsData?.membersSharingSameShift ?? 0;

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
      baseBalance: analyticsData?.baseLeaveBalance ?? baseBalance,
      remainderDays,
      membersSharingSameShift
    };
  };

  const getMemberMaternityLeaveData = (member: User) => {
    const maxMaternityLeaveDays = team?.settings.maternityLeave?.maxDays || 90;
    const countingMethod = team?.settings.maternityLeave?.countingMethod || 'working';
    
    const memberRequests = allRequests.filter(req => req.userId === member._id);
    const approvedMaternityRequests = memberRequests.filter(req => 
      req.status === 'approved' && req.reason && isMaternityLeave(req.reason)
    );
    
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

    // Calculate maternity days used year-to-date
    let maternityDaysUsed = 0;
    if (member.manualMaternityYearToDateUsed !== undefined) {
      maternityDaysUsed = member.manualMaternityYearToDateUsed;
    } else {
      maternityDaysUsed = approvedMaternityRequests.reduce((total, req) => {
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        
        // Only count days within the current year and up to today
        if (start <= yearEnd && end >= yearStart) {
          const overlapStart = start > yearStart ? start : yearStart;
          const overlapEnd = end < yearEnd ? (end < today ? end : today) : (today < yearEnd ? today : yearEnd);
          
          if (overlapEnd >= overlapStart) {
            const days = countMaternityLeaveDays(overlapStart, overlapEnd, countingMethod, shiftSchedule);
            return total + days;
          }
        }
        return total;
      }, 0);
    }

    // Calculate remaining maternity leave balance
    const approvedMaternityRequestsForCalculation = approvedMaternityRequests.map(req => ({
      startDate: new Date(req.startDate),
      endDate: new Date(req.endDate),
      reason: req.reason
    }));

    const remainingMaternityBalance = calculateMaternityLeaveBalance(
      maxMaternityLeaveDays,
      approvedMaternityRequestsForCalculation,
      countingMethod,
      shiftSchedule,
      member.manualMaternityLeaveBalance,
      member.manualMaternityYearToDateUsed
    );

    const baseMaternityBalance = member.manualMaternityLeaveBalance !== undefined 
      ? member.manualMaternityLeaveBalance 
      : maxMaternityLeaveDays;
    
    const surplusMaternityBalance = calculateMaternitySurplusBalance(
      member.manualMaternityLeaveBalance,
      maxMaternityLeaveDays
    );

    // Calculate percentage used - if base is 0, percentage should be null (display as "-")
    const percentageUsed = baseMaternityBalance > 0 ? (maternityDaysUsed / baseMaternityBalance) * 100 : null;

    return {
      remainingBalance: remainingMaternityBalance,
      daysUsed: maternityDaysUsed,
      baseBalance: baseMaternityBalance,
      percentageUsed,
      surplusBalance: surplusMaternityBalance,
      approvedCount: approvedMaternityRequests.length
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
        
        // Refetch analytics to ensure remaining balance is updated
        try {
          const analyticsResponse = await fetch('/api/analytics', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (analyticsResponse.ok) {
            const analyticsData = await analyticsResponse.json();
            const groupedData = analyticsData.analytics || analyticsData.grouped || null;
            setAnalytics(groupedData);
          }
        } catch (error) {
          console.error('Error refetching analytics:', error);
          // Continue even if analytics refetch fails - local calculation will work
        }
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

  const handleEditMaternityBalance = (member: User) => {
    setEditingMaternityBalance(member._id || null);
    const maternityData = getMemberMaternityLeaveData(member);
    setTempMaternityBalance(Math.round(maternityData.remainingBalance).toString());
  };

  const handleSaveMaternityBalance = async (memberId: string) => {
    const member = members.find(m => m._id === memberId);
    if (!member) return;

    const balanceValue = Math.floor(parseFloat(tempMaternityBalance));
    if (isNaN(balanceValue) || balanceValue < 0) {
      alert('Please enter a valid non-negative whole number');
      return;
    }

    setUpdating(memberId);
    try {
      const token = localStorage.getItem('token');
      const maxMaternityLeaveDays = team?.settings.maternityLeave?.maxDays || 90;
      
      // Get days used - use manualMaternityYearToDateUsed if set, otherwise calculate from approved maternity requests
      let daysUsed: number;
      if (member.manualMaternityYearToDateUsed !== undefined) {
        daysUsed = member.manualMaternityYearToDateUsed;
      } else {
        const memberRequests = allRequests.filter(req => req.userId === memberId);
        const approvedMaternityRequests = memberRequests.filter(req => 
          req.status === 'approved' && req.reason && isMaternityLeave(req.reason)
        );
        
        const countingMethod = team?.settings.maternityLeave?.countingMethod || 'working';
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        daysUsed = approvedMaternityRequests.reduce((total, req) => {
          const reqStart = new Date(req.startDate);
          const reqEnd = new Date(req.endDate);
          reqStart.setHours(0, 0, 0, 0);
          reqEnd.setHours(23, 59, 59, 999);
          
          if (reqStart <= yearEnd && reqEnd >= yearStart) {
            const overlapStart = reqStart > yearStart ? reqStart : yearStart;
            const overlapEnd = reqEnd < yearEnd ? (reqEnd < today ? reqEnd : today) : (today < yearEnd ? today : yearEnd);
            
            if (overlapEnd >= overlapStart) {
              const days = countMaternityLeaveDays(overlapStart, overlapEnd, countingMethod, shiftSchedule);
              return total + days;
            }
          }
          return total;
        }, 0);
      }

      // Calculate base balance (manual balance if set, otherwise max)
      const baseBalance = member.manualMaternityLeaveBalance !== undefined 
        ? member.manualMaternityLeaveBalance 
        : maxMaternityLeaveDays;
      
      // If balance is less than base, set it as the new base
      const newBaseBalance = balanceValue < baseBalance ? balanceValue : baseBalance;
      
      // Calculate new base balance
      const newManualMaternityLeaveBalance = balanceValue + daysUsed;
      
      const response = await fetch(`/api/users/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          manualMaternityLeaveBalance: newManualMaternityLeaveBalance,
          manualMaternityYearToDateUsed: daysUsed
        }),
      });

      if (response.ok) {
        // Update member in state
        setMembers(members.map(m => 
          m._id === memberId 
            ? { 
                ...m, 
                manualMaternityLeaveBalance: newManualMaternityLeaveBalance,
                manualMaternityYearToDateUsed: daysUsed
              }
            : m
        ));
        setEditingMaternityBalance(null);
        setTempMaternityBalance('');
        await fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update maternity leave balance');
      }
    } catch (error) {
      console.error('Error updating maternity leave balance:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEditMaternityBalance = () => {
    setEditingMaternityBalance(null);
    setTempMaternityBalance('');
  };

  const handleEditMaternityDaysTaken = (member: User) => {
    setEditingMaternityDaysTaken(member._id || null);
    const maternityData = getMemberMaternityLeaveData(member);
    setTempMaternityDaysTaken(Math.round(maternityData.daysUsed).toString());
  };

  const handleSaveMaternityDaysTaken = async (memberId: string) => {
    const member = members.find(m => m._id === memberId);
    if (!member) return;

    const daysTakenValue = Math.floor(parseFloat(tempMaternityDaysTaken));
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
        body: JSON.stringify({ manualMaternityYearToDateUsed: daysTakenValue }),
      });

      if (response.ok) {
        // Update member in state
        setMembers(members.map(m => 
          m._id === memberId 
            ? { ...m, manualMaternityYearToDateUsed: daysTakenValue }
            : m
        ));
        setEditingMaternityDaysTaken(null);
        setTempMaternityDaysTaken('');
        await fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update maternity days taken');
      }
    } catch (error) {
      console.error('Error updating maternity days taken:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEditMaternityDaysTaken = () => {
    setEditingMaternityDaysTaken(null);
    setTempMaternityDaysTaken('');
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
        
        // Refetch analytics to ensure remaining balance is updated
        try {
          const analyticsResponse = await fetch('/api/analytics', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (analyticsResponse.ok) {
            const analyticsData = await analyticsResponse.json();
            const groupedData = analyticsData.analytics || analyticsData.grouped || null;
            setAnalytics(groupedData);
          }
        } catch (error) {
          console.error('Error refetching analytics:', error);
          // Continue even if analytics refetch fails - local calculation will work
        }
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

  // Use analytics aggregate data if available, otherwise calculate from members
  const totalMembers = analytics?.aggregate.membersCount ?? allMembersData.length;
  const totalRemainingBalance = analytics?.aggregate.totalRemainingLeaveBalance ?? (() => {
    // Filter out members with 0 base balance from aggregate calculations
    const membersWithNonZeroBase = allMembersData.filter(m => {
      const baseBalance = m.member.manualLeaveBalance !== undefined 
        ? m.member.manualLeaveBalance 
        : (team?.settings.maxLeavePerYear || 20);
      return baseBalance > 0;
    });
    return membersWithNonZeroBase.reduce((sum, m) => sum + m.leaveData.remainingBalance, 0);
  })();
  const totalUsed = (() => {
    // Calculate total used from member data (not in analytics aggregate)
    const membersWithNonZeroBase = allMembersData.filter(m => {
      const baseBalance = m.member.manualLeaveBalance !== undefined 
        ? m.member.manualLeaveBalance 
        : (team?.settings.maxLeavePerYear || 20);
      return baseBalance > 0;
    });
    return membersWithNonZeroBase.reduce((sum, m) => sum + m.leaveData.totalUsed, 0);
  })();
  const averageBalance = analytics?.aggregate.averageRemainingBalance ?? (() => {
    const membersWithNonZeroBase = allMembersData.filter(m => {
      const baseBalance = m.member.manualLeaveBalance !== undefined 
        ? m.member.manualLeaveBalance 
        : (team?.settings.maxLeavePerYear || 20);
      return baseBalance > 0;
    });
    return membersWithNonZeroBase.length > 0 ? totalRemainingBalance / membersWithNonZeroBase.length : 0;
  })();

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

          {/* Remainder Days Notice */}
          {(() => {
            // Use analytics aggregate remainder days if available
            const totalRemainderDays = analytics?.aggregate.totalRemainderDays ?? 0;
            
            if (totalRemainderDays > 0) {
              return (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        Remainder Days Require Allocation
                      </h3>
                      <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                        <p>
                          There are <strong>{totalRemainderDays}</strong> day(s) that cannot be evenly distributed among members sharing the same shift schedule. These remainder days will need to be allocated manually, and not everyone in the affected groups will receive them.
                        </p>
                        <p className="mt-2">
                          See the <strong>Analytics</strong> page for group-level breakdown and detailed allocation information.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Maternity/Paternity Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Maternity Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Maternity Usage %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {memberList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
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
                          {/* Maternity Leave Columns */}
                          {(() => {
                            const maternityData = getMemberMaternityLeaveData(member);
                            const maxMaternityDays = team?.settings.maternityLeave?.maxDays || 90;
                            return (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {editingMaternityBalance === member._id ? (
                                    <div className="space-y-2">
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={tempMaternityBalance}
                                          onChange={(e) => setTempMaternityBalance(e.target.value)}
                                          disabled={updating === member._id}
                                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSaveMaternityBalance(member._id!);
                                            } else if (e.key === 'Escape') {
                                              handleCancelEditMaternityBalance();
                                            }
                                          }}
                                          autoFocus
                                        />
                                        <span className="text-sm text-gray-500 dark:text-gray-400">/ {maxMaternityDays}</span>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => handleSaveMaternityBalance(member._id!)}
                                          disabled={updating === member._id}
                                          className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                                        >
                                          {updating === member._id ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                          onClick={handleCancelEditMaternityBalance}
                                          disabled={updating === member._id}
                                          className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded disabled:opacity-50"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="group">
                                      <div 
                                        className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:text-pink-600 dark:hover:text-pink-400"
                                        onClick={() => handleEditMaternityBalance(member)}
                                        title="Click to edit maternity leave balance"
                                      >
                                        {(() => {
                                          if (maternityData.baseBalance === 0) {
                                            return <>0 / 0</>;
                                          }
                                          return <>{Math.round(maternityData.remainingBalance)} / {maxMaternityDays}</>;
                                        })()}
                                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(remaining)</span>
                                        {maternityData.surplusBalance > 0 && (
                                          <span className="ml-2 text-xs text-green-600 dark:text-green-400" title="Surplus balance">
                                            (+{Math.round(maternityData.surplusBalance)} surplus)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {editingMaternityDaysTaken === member._id ? (
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={tempMaternityDaysTaken}
                                        onChange={(e) => setTempMaternityDaysTaken(e.target.value)}
                                        disabled={updating === member._id}
                                        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 disabled:opacity-50"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveMaternityDaysTaken(member._id!);
                                          } else if (e.key === 'Escape') {
                                            handleCancelEditMaternityDaysTaken();
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveMaternityDaysTaken(member._id!)}
                                        disabled={updating === member._id}
                                        className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                                      >
                                        {updating === member._id ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={handleCancelEditMaternityDaysTaken}
                                        disabled={updating === member._id}
                                        className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      className="text-sm text-gray-900 dark:text-white cursor-pointer hover:text-pink-600 dark:hover:text-pink-400"
                                      onClick={() => handleEditMaternityDaysTaken(member)}
                                      title="Click to edit maternity days taken"
                                    >
                                      {Math.round(maternityData.daysUsed)}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {maternityData.percentageUsed !== null ? `${Math.round(maternityData.percentageUsed)}%` : '-'}
                                  </span>
                                </td>
                              </>
                            );
                          })()}
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

