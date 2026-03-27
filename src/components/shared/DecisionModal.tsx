'use client';

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export type DecisionType = 'approve' | 'reject';

interface DecisionModalProps {
  open: boolean;
  type: DecisionType;
  /** Set true for bulk actions where the note applies to all selected requests */
  isBulk?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export default function DecisionModal({ open, type, isBulk = false, onConfirm, onCancel }: DecisionModalProps) {
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset note and focus input whenever the modal opens
  useEffect(() => {
    if (open) {
      setNote('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const isApproval = type === 'approve';
  const label = isBulk
    ? isApproval ? 'Approve selected requests' : 'Reject selected requests'
    : isApproval ? 'Approve request' : 'Reject request';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApproval && !note.trim()) return;
    onConfirm(note.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <h2
            id="decision-modal-title"
            className={`text-sm font-semibold ${isApproval ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {label}
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
          <div>
            <label htmlFor="decision-note" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isApproval ? 'Approval note' : 'Rejection reason'}
              {!isApproval && <span className="text-red-500 ml-0.5">*</span>}
              {isApproval && <span className="text-zinc-400 ml-1">(optional)</span>}
            </label>
            <textarea
              id="decision-note"
              ref={inputRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={!isApproval}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder-zinc-400 dark:placeholder-zinc-500"
              placeholder={isApproval ? 'Add a note for the member…' : 'Explain why this request is being rejected…'}
            />
          </div>

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
              disabled={!isApproval && !note.trim()}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isApproval
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isApproval ? 'Approve' : 'Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
