'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import NotificationPromptBanner from '@/components/shared/NotificationPromptBanner';
import { useAuth } from '@/contexts/AuthContext';
import { clearStoredUser, setStoredUser } from '@/lib/clientUserStorage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'leader' | 'member';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user: authUser, loading: authLoading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!authUser) {
      clearStoredUser();
      router.push('/login');
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    if (requiredRole && authUser.role !== requiredRole) {
      if (authUser.role === 'leader') {
        router.push('/leader/dashboard');
      } else if (authUser.role === 'member') {
        router.push('/member/dashboard');
      } else {
        router.push('/login');
      }
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const profileResponse = await fetch('/api/users/profile', { credentials: 'include' });
        if (cancelled) return;
        if (!profileResponse.ok) {
          clearStoredUser();
          router.push('/login');
          setIsAuthenticated(false);
          return;
        }

        const profileData = await profileResponse.json();
        if (!profileData?.user?.id || !profileData?.user?.role) {
          clearStoredUser();
          router.push('/login');
          setIsAuthenticated(false);
          return;
        }

        const u = profileData.user as {
          firstName?: string;
          lastName?: string;
          role?: 'leader' | 'member';
          nameReviewRequired?: boolean;
        };
        const hasName = Boolean(u?.firstName?.trim?.() && u?.lastName?.trim?.());
        const needsReview = u?.nameReviewRequired === true;
        if (!hasName || needsReview) {
          const target = u.role === 'leader' ? '/leader/profile' : '/member/profile';
          if (pathname !== target) {
            router.push(target);
            setIsAuthenticated(false);
            return;
          }
          setIsAuthenticated(true);
          return;
        }

        setStoredUser(profileData.user);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Protected route auth error:', error);
        if (!cancelled) {
          clearStoredUser();
          router.push('/login');
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, requiredRole, pathname, router]);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-2 border-gray-200 dark:border-gray-800 border-t-gray-400 dark:border-t-gray-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <div className="pb-40 lg:pb-28">{children}</div>
      <NotificationPromptBanner />
    </>
  );
}
