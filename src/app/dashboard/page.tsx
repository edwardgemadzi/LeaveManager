'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const redirectBySession = async () => {
      try {
        const response = await fetch('/api/users/profile', { credentials: 'include' });
        if (!response.ok) {
          localStorage.removeItem('user');
          router.push('/login');
          return;
        }

        const data = await response.json();
        if (!data?.user?.role) {
          localStorage.removeItem('user');
          router.push('/login');
          return;
        }

        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user.role === 'leader') {
          router.push('/leader/dashboard');
        } else {
          router.push('/member/dashboard');
        }
      } catch {
        router.push('/login');
      }
    };

    redirectBySession();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Redirecting...</p>
      </div>
    </div>
  );
}
