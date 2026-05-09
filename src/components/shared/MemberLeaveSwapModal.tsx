'use client';

import { useEffect, useState } from 'react';
import type { LeaveRequest } from '@/types';
import { formatDateSafe, parseDateSafe } from '@/lib/dateUtils';

type Props = {
  open: boolean;
  request: LeaveRequest | null;
  onClose: () => void;
  onSuccess: () => void;
  showInfo: (msg: string) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
};

export default function MemberLeaveSwapModal({
  open,
  request,
  onClose,
  onSuccess,
  showInfo,
  showSuccess,
  showError,
}: Props) {
  const [sourceSubStart, setSourceSubStart] = useState('');
  const [sourceSubEnd, setSourceSubEnd] = useState('');
  const [targetStart, setTargetStart] = useState('');
  const [targetEnd, setTargetEnd] = useState('');
  const [memberNote, setMemberNote] = useState('');
  const [preview, setPreview] = useState<{ available: boolean; message: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const rStart = request ? formatDateSafe(parseDateSafe(request.startDate)) : '';
  const rEnd = request ? formatDateSafe(parseDateSafe(request.endDate)) : '';

  useEffect(() => {
    if (!open || !request) return;
    setSourceSubStart(rStart);
    setSourceSubEnd(rEnd);
    setTargetStart('');
    setTargetEnd('');
    setMemberNote('');
    setPreview(null);
  }, [open, request, rStart, rEnd]);

  const runPreview = async () => {
    if (!request?._id || !targetStart || !targetEnd || !sourceSubStart || !sourceSubEnd) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/leave-swap-requests/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leaveRequestId: request._id,
          sourceSubStart,
          sourceSubEnd,
          targetStart,
          targetEnd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreview({ available: false, message: String(data.error || 'Preview failed') });
        return;
      }
      setPreview({
        available: Boolean(data.available),
        message: String(data.message || ''),
      });
    } catch {
      setPreview({ available: false, message: 'Could not check availability.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request?._id) return;

    const s0 = parseDateSafe(sourceSubStart);
    const s1 = parseDateSafe(sourceSubEnd);
    const t0 = parseDateSafe(targetStart);
    const t1 = parseDateSafe(targetEnd);
    const rs = parseDateSafe(request.startDate);
    const re = parseDateSafe(request.endDate);

    if (s0 > s1 || t0 > t1) {
      showInfo('End date must be on or after start date for both ranges.');
      return;
    }
    if (formatDateSafe(s0) < formatDateSafe(rs) || formatDateSafe(s1) > formatDateSafe(re)) {
      showInfo('Source sub-range must stay within your approved leave.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/leave-swap-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leaveRequestId: request._id,
          sourceSubStart,
          sourceSubEnd,
          targetStart,
          targetEnd,
          memberNote: memberNote.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(String(data.error || 'Failed to submit swap request'));
        return;
      }
      showSuccess(
        'Swap request submitted. Your leader will review it. They get an email or Telegram message when those are enabled on their account.'
      );
      onSuccess();
      onClose();
    } catch {
      showError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !request) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="swap-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2 id="swap-modal-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Request date swap
          </h2>
          <button type="button" onClick={onClose} className="btn-secondary text-xs py-1 px-2">
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Approved leave {rStart} – {rEnd}. Choose which consecutive days to move and your new dates. Your leader must approve.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">Move from (start)</label>
              <input
                type="date"
                className="input-modern w-full"
                min={rStart}
                max={rEnd}
                value={sourceSubStart}
                onChange={(e) => setSourceSubStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">Move from (end)</label>
              <input
                type="date"
                className="input-modern w-full"
                min={sourceSubStart || rStart}
                max={rEnd}
                value={sourceSubEnd}
                onChange={(e) => setSourceSubEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">New start</label>
              <input
                type="date"
                className="input-modern w-full"
                value={targetStart}
                onChange={(e) => setTargetStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">New end</label>
              <input
                type="date"
                className="input-modern w-full"
                min={targetStart}
                value={targetEnd}
                onChange={(e) => setTargetEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">Note (optional)</label>
            <textarea
              className="input-modern w-full min-h-[72px] text-sm"
              maxLength={500}
              value={memberNote}
              onChange={(e) => setMemberNote(e.target.value)}
              placeholder="Context for your leader…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary text-xs py-1.5 px-3" onClick={() => void runPreview()} disabled={previewLoading}>
              {previewLoading ? 'Checking…' : 'Check target dates'}
            </button>
            {preview && (
              <span className={`text-xs ${preview.available ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                {preview.message}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit swap request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
