'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Shown when the user should add contact info for leave notifications (email/Telegram on Profile).
 */
export default function NotificationPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [profilePath, setProfilePath] = useState('/member/profile');
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/profile', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const u = data.user;
        if (!u?.needsNotificationSetup) return;
        setProfilePath(u.role === 'leader' ? '/leader/profile' : '/member/profile');
        setVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async () => {
    setDismissing(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissNotificationPrompt: true }),
      });
      if (res.ok) {
        setVisible(false);
      }
    } finally {
      setDismissing(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/95 text-gray-900 dark:text-gray-100 px-4 py-3 shadow-lg"
      role="region"
      aria-label="Notification setup"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm sm:text-base">
          <span className="font-semibold">Stay updated:</span> add your email (and optionally Telegram) on your profile
          so we can notify you about leave requests and decisions.
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href={profilePath}
            className="inline-flex justify-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
          >
            Open profile
          </Link>
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            className="text-sm text-indigo-800 dark:text-indigo-200 underline disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
