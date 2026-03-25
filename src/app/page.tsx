'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearStoredUser, setStoredUser } from '@/lib/clientUserStorage';

export default function HomePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/users/profile', { credentials: 'include' });
        if (!response.ok) {
          clearStoredUser();
          return;
        }

        const data = await response.json();
        if (!data?.user?.role) {
          clearStoredUser();
          return;
        }

        setStoredUser(data.user);
        if (data.user.role === 'leader') {
          router.push('/leader/dashboard');
          return;
        }
        router.push('/member/dashboard');
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-8 fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Leave Manager</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
            Simple, transparent leave management for your whole team.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link href="/register-leader" className="btn-primary justify-center py-2.5 text-sm font-medium">
            Create a team
          </Link>
          <Link href="/register-member"
            className="btn-secondary justify-center py-2.5 text-sm font-medium">
            Join a team
          </Link>
        </div>

        <Link href="/login" className="block text-xs text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          Already have an account? Sign in →
        </Link>
      </div>
    </div>
  );
}