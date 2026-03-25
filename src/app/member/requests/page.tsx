'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import { LeaveRequest } from '@/types';
import { LEAVE_REASONS } from '@/lib/leaveReasons';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNotification } from '@/hooks/useNotification';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { parseDateSafe } from '@/lib/dateUtils';
import { isBypassNoticePeriodActive } from '@/lib/noticePeriod';
import { useTeamData } from '@/hooks/useTeamData';
import { useRequests } from '@/hooks/useRequests';

type LeaveDateConstraintDay = {
  selectable: boolean;
  codes: string[];
  message: string;
};

export default function MemberRequestsPage() {
  const { showSuccess, showError, showInfo } = useNotification();
  const { showNotification: showBrowserNotification } = useBrowserNotification();
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    customReason: '',
  });
  const [teamSettings, setTeamSettings] = useState<{
    minimumNoticePeriod: number;
    bypassNoticePeriod?: { enabled: boolean; startDate?: Date | string; endDate?: Date | string };
  }>({
    minimumNoticePeriod: 1,
  });
  const [selectedReasonType, setSelectedReasonType] = useState('');

  const leaveReasons = LEAVE_REASONS;
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [availabilityPreview, setAvailabilityPreview] = useState<{ available: boolean; message: string } | null>(null);
  const [dateConstraints, setDateConstraints] = useState<Record<string, LeaveDateConstraintDay>>({});
  const bypassActive = isBypassNoticePeriodActive(teamSettings);
  const todayIso = new Date().toISOString().split('T')[0];
  const minStartDateIso = (() => {
    if (bypassActive || teamSettings.minimumNoticePeriod <= 0) {
      return todayIso;
    }
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() + teamSettings.minimumNoticePeriod);
    return minDate.toISOString().split('T')[0];
  })();

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

  const { data: teamData, isLoading: teamLoading } = useTeamData({ members: 'none' });
  const { data: allRequests, mutate: mutateRequests, isLoading: requestsLoading } = useRequests({
    fields: ['_id', 'userId', 'startDate', 'endDate', 'reason', 'status', 'decisionNote', 'decisionAt', 'decisionByUsername', 'createdAt'],
  });

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/users/profile', { credentials: 'include' });
        if (!res.ok) {
          setUserId(null);
          return;
        }
        const data = await res.json();
        const id = (data?.user?.id as string | undefined) || null;
        setUserId(id);
        if (data?.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
      } catch {
        setUserId(null);
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (teamData?.team?.settings) {
      setTeamSettings(teamData.team.settings);
    }
  }, [teamData]);

  useEffect(() => {
    if (!allRequests || !userId) return;
    setMyRequests(allRequests.filter((req: LeaveRequest) => req.userId === userId));
  }, [allRequests, userId]);

  useEffect(() => {
    setLoading(teamLoading || requestsLoading);
  }, [teamLoading, requestsLoading]);

  useEffect(() => {
    const controller = new AbortController();

    const runPreview = async () => {
      if (!formData.startDate || !formData.endDate || !showForm) {
        setAvailabilityPreview(null);
        return;
      }

      try {
        const response = await fetch(
          `/api/leave-requests/availability?startDate=${encodeURIComponent(formData.startDate)}&endDate=${encodeURIComponent(formData.endDate)}`,
          { credentials: 'include', signal: controller.signal }
        );
        if (!response.ok) {
          setAvailabilityPreview(null);
          return;
        }
        const data = await response.json();
        setAvailabilityPreview({
          available: Boolean(data.available),
          message: String(data.message || ''),
        });
      } catch {
        setAvailabilityPreview(null);
      }
    };

    runPreview();

    return () => {
      controller.abort();
    };
  }, [formData.startDate, formData.endDate, showForm]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchConstraints = async () => {
      if (!showForm) return;
      const from = minStartDateIso;
      const toDate = new Date(from);
      toDate.setDate(toDate.getDate() + 120);
      const to = toDate.toISOString().split('T')[0];
      try {
        const response = await fetch(
          `/api/leave-requests/constraints?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { credentials: 'include', signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();
        setDateConstraints(data.days || {});
      } catch {
        // ignore transient constraint fetch failures
      }
    };
    fetchConstraints();
    return () => controller.abort();
  }, [showForm, minStartDateIso]);

  const isDateSelectable = (dateIso: string): { selectable: boolean; message?: string } => {
    if (!dateIso || dateIso < todayIso) {
      return { selectable: false, message: 'Past dates cannot be requested.' };
    }
    const constraint = dateConstraints[dateIso];
    if (!constraint) {
      return { selectable: false, message: 'Date constraints are still loading. Please try again in a moment.' };
    }
    return { selectable: constraint.selectable, message: constraint.message };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!selectedReasonType) {
      showInfo('Please select a reason for your leave request.');
      return;
    }
    
    if (selectedReasonType === 'other' && !formData.customReason.trim()) {
      showInfo('Please provide details for your leave request.');
      return;
    }
    
    // Check minimum notice period
    if (!bypassActive && teamSettings.minimumNoticePeriod > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(formData.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const daysDifference = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDifference < teamSettings.minimumNoticePeriod) {
        showInfo(`Leave requests must be submitted at least ${teamSettings.minimumNoticePeriod} day(s) in advance. Please select a start date ${teamSettings.minimumNoticePeriod} or more days from today.`);
        return;
      }
    }
    
    setSubmitting(true);

    try {
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          reason: getFinalReason(),
        }),
      });

      if (response.ok) {
        await response.json();
        await mutateRequests();
        setFormData({ startDate: '', endDate: '', reason: '', customReason: '' });
        setSelectedReasonType('');
        setShowForm(false);
        showSuccess('Leave request submitted successfully!');
        const startDate = new Date(formData.startDate).toLocaleDateString();
        const endDate = new Date(formData.endDate).toLocaleDateString();
        showBrowserNotification(
          'Leave Request Submitted',
          `Your leave request for ${startDate} to ${endDate} has been submitted successfully!`
        );
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      showError('Error submitting request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this request? It will be removed from active requests, and your leader can restore it if needed.')) {
      return;
    }

    setDeleting(requestId);
    try {
      const response = await fetch(`/api/leave-requests/${requestId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        await mutateRequests();
        showSuccess('Request cancelled successfully');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      showError('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const handleEditPending = async (request: LeaveRequest) => {
    const startDate = prompt(
      'New start date (YYYY-MM-DD)',
      request.startDate ? new Date(request.startDate).toISOString().split('T')[0] : ''
    );
    if (!startDate) return;

    const endDate = prompt(
      'New end date (YYYY-MM-DD)',
      request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : ''
    );
    if (!endDate) return;

    const reason = prompt('Updated reason', request.reason || '');
    if (!reason || !reason.trim()) {
      showInfo('A reason is required to update your request.');
      return;
    }

    try {
      const response = await fetch(`/api/leave-requests/${request._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          startDate,
          endDate,
          reason: reason.trim(),
        }),
      });

      if (response.ok) {
        await mutateRequests();
        showSuccess('Pending request updated successfully.');
      } else {
        const error = await response.json();
        showError(error.error || 'Failed to update request');
      }
    } catch (error) {
      console.error('Error editing request:', error);
      showError('Network error. Please try again.');
    }
  };

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
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">My Leave Requests</h1>
              <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Manage your leave requests and view their status</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary flex items-center justify-center gap-2 px-4 py-2.5"
            >
              {showForm ? 'Cancel' : 'New Request'}
            </button>
          </div>
        </div>

        {/* Request Form - Enhanced */}
        {showForm && (
          <div className="card mb-8">
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Submit Leave Request</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      required
                      min={minStartDateIso}
                      value={formData.startDate}
                      onChange={(e) => {
                        const nextStartDate = e.target.value;
                        const selection = isDateSelectable(nextStartDate);
                        if (!selection.selectable) {
                          showInfo(selection.message || 'Selected start date is not available.');
                          return;
                        }
                        setFormData(prev => ({
                          ...prev,
                          startDate: nextStartDate,
                          endDate: prev.endDate && prev.endDate < nextStartDate ? nextStartDate : prev.endDate,
                        }));
                      }}
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
                      min={formData.startDate || minStartDateIso}
                      value={formData.endDate}
                      onChange={(e) => {
                        const nextEndDate = e.target.value;
                        const start = formData.startDate;
                        if (!start) {
                          setFormData({ ...formData, endDate: nextEndDate });
                          return;
                        }

                        const startDate = new Date(start);
                        const endDate = new Date(nextEndDate);
                        if (endDate < startDate) {
                          showInfo('End date cannot be before start date.');
                          return;
                        }

                        const cursor = new Date(startDate);
                        cursor.setHours(0, 0, 0, 0);
                        const last = new Date(endDate);
                        last.setHours(0, 0, 0, 0);
                        while (cursor <= last) {
                          const dayKey = cursor.toISOString().split('T')[0];
                          const selection = isDateSelectable(dayKey);
                          if (!selection.selectable) {
                            showInfo(selection.message || `Date ${dayKey} is not available.`);
                            return;
                          }
                          cursor.setDate(cursor.getDate() + 1);
                        }

                        setFormData({ ...formData, endDate: nextEndDate });
                      }}
                      className="input-modern w-full"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      For single-day leave, use the same date for both start and end
                      {teamSettings.minimumNoticePeriod > 0 && !bypassActive && (
                        <span className="flex items-center gap-2 mt-2 text-orange-600 dark:text-orange-400 font-medium">
                          <ExclamationTriangleIcon className="h-4 w-4" />
                          Leave requests must be submitted at least {teamSettings.minimumNoticePeriod} day(s) in advance
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {availabilityPreview && (
                  <div className={`rounded-lg px-4 py-3 text-sm ${
                    availabilityPreview.available
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                      : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                  }`}>
                    {availabilityPreview.message}
                  </div>
                )}
                <div>
                  <label htmlFor="reason" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Reason for Leave
                  </label>
                  <select
                    id="reason"
                    required
                    value={selectedReasonType}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    className="input-modern w-full"
                  >
                    <option value="">Select a reason...</option>
                    {leaveReasons.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  
                  {selectedReasonType === 'other' && (
                    <div className="mt-4">
                      <label htmlFor="customReason" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Please specify
                      </label>
                      <textarea
                        id="customReason"
                        rows={3}
                        required
                        value={formData.customReason}
                        onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                        className="input-modern w-full"
                        placeholder="Please provide details for your leave request..."
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn-secondary px-4 py-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary px-4 py-2.5 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Requests List - Enhanced */}
        <div className="card">
          <div className="p-5 sm:p-6">
            {myRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <svg className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-base font-medium text-gray-500 dark:text-gray-400 mb-1">No requests yet</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Create your first request above</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {myRequests.map((request) => (
                  <div key={request._id} className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-900 dark:to-gray-800/50 rounded-xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 stagger-item">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-3 mb-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                          {parseDateSafe(request.startDate).toLocaleDateString()} - {parseDateSafe(request.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-base text-gray-700 dark:text-gray-300 mb-3">{request.reason}</p>
                        {request.decisionNote && (
                          <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-2">
                            Decision note: {request.decisionNote}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Requested on {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                        {request.status === 'pending' && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Pending for {Math.max(1, Math.ceil((Date.now() - new Date(request.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} day(s)
                          </p>
                        )}
                        {request.decisionAt && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Decided on {new Date(request.decisionAt).toLocaleDateString()}
                            {request.decisionByUsername ? ` by ${request.decisionByUsername}` : ''}
                          </p>
                        )}
                      </div>
                      {request.status === 'pending' && (
                        <div className="sm:ml-4 sm:flex-shrink-0 flex gap-2">
                          <button
                            onClick={() => handleEditPending(request)}
                            className="btn-secondary px-3 py-2 text-sm"
                            title="Edit pending request"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(request._id!)}
                            disabled={deleting === request._id}
                            className="btn-danger px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
