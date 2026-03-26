'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { LeaveRequest } from '@/types';
import { LEAVE_REASONS } from '@/lib/leaveReasons';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNotification } from '@/hooks/useNotification';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';
import { parseDateSafe } from '@/lib/dateUtils';
import { isBypassNoticePeriodActive } from '@/lib/noticePeriod';
import { useTeamData } from '@/hooks/useTeamData';
import { useRequests } from '@/hooks/useRequests';
import { setStoredUser } from '@/lib/clientUserStorage';

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
    isHistorical: false,
  });
  const [teamSettings, setTeamSettings] = useState<{
    minimumNoticePeriod: number;
    bypassNoticePeriod?: { enabled: boolean; startDate?: Date | string; endDate?: Date | string };
    allowMemberHistoricalSubmissions?: boolean;
    historicalSubmissionLookbackDays?: number;
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
    if (formData.isHistorical) {
      const minDate = new Date();
      minDate.setHours(0, 0, 0, 0);
      minDate.setDate(minDate.getDate() - (teamSettings.historicalSubmissionLookbackDays || 365));
      return minDate.toISOString().split('T')[0];
    }
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
          setStoredUser(data.user);
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
    if (formData.isHistorical) {
      return { selectable: true };
    }
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
    if (!formData.isHistorical && !bypassActive && teamSettings.minimumNoticePeriod > 0) {
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
          isHistorical: formData.isHistorical,
        }),
      });

      if (response.ok) {
        await response.json();
        await mutateRequests();
        setFormData({ startDate: '', endDate: '', reason: '', customReason: '', isHistorical: false });
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

  return (
    <ProtectedRoute requiredRole="member">
      {loading ? (
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Navbar />
      
      <div className="w-full px-4 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
        {/* Page header */}
        <div className="flex items-center justify-between py-5 border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <div>
            <h1 className="app-page-heading text-base font-semibold text-zinc-900 dark:text-zinc-100">My Leave Requests</h1>
            <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Manage and track your leave</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className={showForm ? 'btn-secondary' : 'btn-primary'}
          >
            {showForm ? 'Cancel' : 'New Request'}
          </button>
        </div>

        {teamSettings.allowMemberHistoricalSubmissions && (
          <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3">
            <p className="text-sm text-indigo-800 dark:text-indigo-300">
              Historical submissions are enabled for your team. Open <strong>New Request</strong> and turn on <strong>Historical submission</strong> to file past leave for approval.
            </p>
          </div>
        )}

        {/* Request drawer */}
        {showForm && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-black/30 dark:bg-black/50"
              aria-label="Close request drawer"
            />
            <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl">
              <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New leave request</h3>
                  <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Pick dates and add a short reason</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs py-1 px-2">
                  Close
                </button>
              </div>
              <div className="p-5 sm:p-6 overflow-y-auto max-h-[calc(100vh-80px)]">
                <form onSubmit={handleSubmit} className="space-y-6">
                {teamData?.team?.settings?.allowMemberHistoricalSubmissions && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.isHistorical}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            isHistorical: e.target.checked,
                            startDate: '',
                            endDate: '',
                          }))
                        }
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-gray-900"
                      />
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Historical submission
                      </span>
                    </label>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Use this for past leave entries that require leader approval.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
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
                    <label htmlFor="endDate" className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
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
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
                  <label htmlFor="reason" className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
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
                      <label htmlFor="customReason" className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
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
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-zinc-200 dark:border-zinc-800">
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
          </div>
        )}

        {/* Requests list */}
        <div className="rounded-[32px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden lg:h-[calc(100vh-220px)] lg:overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Requests</p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">History and status</p>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{myRequests.length} total</span>
          </div>
          <div className="p-0 lg:h-[calc(100vh-280px)] lg:overflow-auto">
            {myRequests.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                No requests yet. Use <span className="font-medium text-zinc-700 dark:text-zinc-200">New Request</span> to create one.
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                {myRequests.map((request) => {
                  const statusTone =
                    request.status === 'approved'
                      ? 'bg-emerald-500'
                      : request.status === 'rejected'
                        ? 'bg-red-500'
                        : 'bg-amber-500';

                  return (
                    <div key={request._id} className="px-5 sm:px-6 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} aria-hidden="true" />
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {parseDateSafe(request.startDate).toLocaleDateString()} – {parseDateSafe(request.endDate).toLocaleDateString()}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 line-clamp-2">{request.reason}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span>Requested {new Date(request.createdAt).toLocaleDateString()}</span>
                            {request.decisionAt ? (
                              <span>
                                · Decided {new Date(request.decisionAt).toLocaleDateString()}
                                {request.decisionByUsername ? ` by ${request.decisionByUsername}` : ''}
                              </span>
                            ) : null}
                          </div>
                          {request.decisionNote ? (
                            <div className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">
                              Decision note: {request.decisionNote}
                            </div>
                          ) : null}
                        </div>

                        {request.status === 'pending' ? (
                          <div className="shrink-0 flex items-center gap-2">
                            <button onClick={() => handleEditPending(request)} className="btn-secondary text-xs py-1.5 px-2.5">
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(request._id!)}
                              disabled={deleting === request._id}
                              className="btn-danger text-xs py-1.5 px-2.5 disabled:opacity-50"
                            >
                              {deleting === request._id ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        ) : null}
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
      )}
    </ProtectedRoute>
  );
}
