'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Unable to submit request');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Forgot Password</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          Enter your username or email and we&apos;ll send a reset link.
        </p>
        {submitted ? (
          <p className="text-sm text-emerald-600 mt-4">If the account exists, a reset link has been sent.</p>
        ) : (
          <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="input-modern w-full"
              placeholder="username or email"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="text-xs text-zinc-500 mt-4">
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

