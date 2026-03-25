'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { setStoredUser } from '@/lib/clientUserStorage';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setStoredUser(data.user);
        if (data.user.role === 'leader') {
          router.push('/leader/dashboard');
        } else {
          router.push('/member/dashboard');
        }
      } else {
        console.error('Login failed:', data);
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 rounded-lg text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm fade-in">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 mb-4">
            <CalendarIcon className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Leave Manager</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Sign in to your account</p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                className="input-modern"
                placeholder="your username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input-modern"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-6">
          No account?{' '}
          <Link href="/register-leader" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            Create a team
          </Link>
          {' '}or{' '}
          <Link href="/register-member" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            Join a team
          </Link>
        </p>
      </div>
    </div>
  );
}
