'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { setStoredUser } from '@/lib/clientUserStorage';

export default function RegisterLeaderPage() {
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    middleName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    teamName: '',
    teamUsername: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register-leader', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          firstName: formData.firstName,
          middleName: formData.middleName || null,
          lastName: formData.lastName,
          password: formData.password,
          teamName: formData.teamName,
          teamUsername: formData.teamUsername,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStoredUser(data.user);
        router.push('/leader/dashboard');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls = 'input-modern';
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4 py-12">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 rounded-lg text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Create a team</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Sign in</Link>
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <div className="grid grid-cols-3 gap-2">
                <input name="firstName" type="text" required className={inputCls} placeholder="First"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
                <input name="middleName" type="text" className={inputCls} placeholder="Middle"
                  value={formData.middleName}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
                <input name="lastName" type="text" required className={inputCls} placeholder="Last"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
              </div>
            </div>

            <div>
              <label htmlFor="username" className={labelCls}>Username</label>
              <input id="username" name="username" type="text" required className={inputCls} placeholder="your username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })} />
            </div>

            <div>
              <label htmlFor="teamName" className={labelCls}>Team Name</label>
              <input id="teamName" name="teamName" type="text" required className={inputCls} placeholder="e.g. Engineering"
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })} />
            </div>

            <div>
              <label htmlFor="teamUsername" className={labelCls}>Team Username</label>
              <input id="teamUsername" name="teamUsername" type="text" required className={inputCls} placeholder="unique-team-id"
                value={formData.teamUsername}
                onChange={(e) => setFormData({ ...formData, teamUsername: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Members use this to join your team</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="password" className={labelCls}>Password</label>
                <input id="password" name="password" type="password" required className={inputCls} placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={labelCls}>Confirm</label>
                <input id="confirmPassword" name="confirmPassword" type="password" required className={inputCls} placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5 mt-2">
            {isLoading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating team…</>
            ) : 'Create team'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
