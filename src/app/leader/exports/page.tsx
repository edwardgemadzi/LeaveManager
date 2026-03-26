'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';

export default function LeaderExportsPage() {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<string>('');
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = (format: 'json' | 'csv' = 'json') => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('format', format);
    return params.toString();
  };

  const runExport = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/exports/pack?${buildQuery('json')}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to export');
      } else {
        setPayload(JSON.stringify(data, null, 2));
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/exports/pack?${buildQuery('csv')}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to export CSV');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-pack-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <Navbar />
        <div className="w-full px-4 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
          <div className="max-w-5xl mx-auto space-y-4">
            <div>
              <Link href="/leader/dashboard" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                ← Back to dashboard
              </Link>
            </div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Export Pack</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Export pack is for operations and reporting: it bundles payroll-oriented leave data, balances, and audit history for your team.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm text-zinc-600 dark:text-zinc-300">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="input-modern w-full mt-1"
                />
              </label>
              <label className="text-sm text-zinc-600 dark:text-zinc-300">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="input-modern w-full mt-1"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={runExport} disabled={loading} className="btn-primary">
                {loading ? 'Generating...' : 'Preview JSON'}
              </button>
              <button onClick={downloadCsv} disabled={loading} className="btn-secondary">
                Download CSV
              </button>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {payload ? (
              <pre className="text-xs overflow-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                {payload}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

