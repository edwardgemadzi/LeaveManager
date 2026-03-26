'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params?.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [valid, setValid] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) return setValid(false);
      const response = await fetch(`/api/auth/password/validate?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      setValid(Boolean(data.valid));
    };
    void run();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        setMessage(data.error || 'Unable to reset password');
      } else {
        setMessage('Password reset successful. You can now sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Reset Password</h1>
        {valid === false && (
          <p className="text-sm text-red-600 mt-3">This reset link is invalid or expired.</p>
        )}
        {valid && (
          <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="input-modern w-full"
              placeholder="New password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="input-modern w-full"
              placeholder="Confirm password"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        )}
        {message && <p className="text-sm mt-3 text-zinc-600 dark:text-zinc-300">{message}</p>}
        <p className="text-xs text-zinc-500 mt-4">
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading reset link...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

