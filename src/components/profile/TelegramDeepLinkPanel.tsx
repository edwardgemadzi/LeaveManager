'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@/types';

type Props = {
  botUsername: string;
  onLinked: (user: User) => void;
  onFeedback: () => void;
  setError: (msg: string) => void;
  setMessage: (msg: string) => void;
};

const POLL_MS = 4000;
const POLL_MAX = 24;

export default function TelegramDeepLinkPanel({
  botUsername,
  onLinked,
  onFeedback,
  setError,
  setMessage,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    pollCount.current = 0;
  }, []);

  const refreshProfile = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/users/profile', { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      const u = data.user as User & { telegramUserId?: string | null };
      if (u?.telegramUserId) {
        onLinked(u);
        localStorage.setItem('user', JSON.stringify(u));
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }, [onLinked]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      pollCount.current += 1;
      const linked = await refreshProfile();
      if (linked) {
        stopPolling();
        setDeepLink(null);
        setExpiresAt(null);
        setMessage(
          'Telegram linked via the app. You should see a confirmation message from the bot in Telegram.'
        );
        onFeedback();
        return;
      }
      if (pollCount.current >= POLL_MAX) {
        stopPolling();
        setMessage(
          'If you already tapped Start in Telegram, refresh this page or use “Refresh” below. If the bot never responded, check that the webhook URL and TELEGRAM_WEBHOOK_SECRET match your server.'
        );
        onFeedback();
      }
    }, POLL_MS);
  }, [onFeedback, refreshProfile, setMessage, stopPolling]);

  const handleGenerate = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    stopPolling();
    setDeepLink(null);
    setExpiresAt(null);
    try {
      const res = await fetch('/api/users/telegram/deep-link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create Telegram link.');
        onFeedback();
        return;
      }
      setDeepLink(data.deepLink);
      setExpiresAt(data.expiresAt ?? null);
      setMessage(data.message || 'Open the link in Telegram and tap Start.');
      const already = await refreshProfile();
      if (already) {
        setDeepLink(null);
        setExpiresAt(null);
        setMessage('Telegram linked via the app.');
        onFeedback();
        return;
      }
      startPolling();
      onFeedback();
    } catch {
      setError('Network error creating Telegram link.');
      onFeedback();
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setMessage('Link copied. Open it in Telegram and tap Start.');
      onFeedback();
    } catch {
      setError('Could not copy to clipboard.');
      onFeedback();
    }
  };

  const handle = botUsername.trim().replace(/^@/, '');

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 px-3 py-3 mt-3 space-y-2">
      <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
        Link in Telegram app (no website login)
      </p>
      <p className="text-xs text-indigo-800/90 dark:text-indigo-200/90">
        If “Log in with Telegram” asks for a phone code you never receive, use this instead: we open @{handle}{' '}
        in the app with a private link. <strong>Do not share the link</strong> — anyone who opens it can attach
        their Telegram to your Leave Manager account.
      </p>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? 'Creating link…' : 'Generate link for Telegram app'}
      </button>
      {deepLink ? (
        <div className="space-y-2 pt-1">
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium text-indigo-700 dark:text-indigo-300 underline break-all"
          >
            Open in Telegram
          </a>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshProfile().then((ok) => {
                  if (ok) {
                    setDeepLink(null);
                    setExpiresAt(null);
                    stopPolling();
                    setMessage('Telegram linked via the app.');
                    onFeedback();
                  } else {
                    setMessage('Not linked yet — open the link in Telegram and tap Start, then try again.');
                    onFeedback();
                  }
                });
              }}
              className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
            >
              I tapped Start — refresh status
            </button>
          </div>
          {expiresAt ? (
            <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Link expires around {new Date(expiresAt).toLocaleString()}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
