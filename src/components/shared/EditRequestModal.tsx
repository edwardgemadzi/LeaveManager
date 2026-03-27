'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { LeaveRequest } from '@/types';

interface EditRequestModalProps {
  open: boolean;
  request: LeaveRequest | null;
  onConfirm: (data: { startDate: string; endDate: string; reason: string }) => void;
  onCancel: () => void;
}

export default function EditRequestModal({ open, request, onConfirm, onCancel }: EditRequestModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && request) {
      setStartDate(request.startDate ? new Date(request.startDate).toISOString().split('T')[0] : '');
      setEndDate(request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : '');
      setReason(request.reason || '');
      setError('');
    }
  }, [open, request]);

  if (!open || !request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date must be on or after start date.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    onConfirm({ startDate, endDate, reason: reason.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-request-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 id="edit-request-modal-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Edit leave request
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Cancel"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-start-date" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Start date <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-start-date"
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setError(''); }}
                required
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit-end-date" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                End date <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => { setEndDate(e.target.value); setError(''); }}
                required
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-reason" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(''); }}
              required
              rows={3}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder-zinc-400 dark:placeholder-zinc-500"
              placeholder="Reason for leave…"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
