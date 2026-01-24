'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isTokenExpired } from '@/lib/api-client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'leader' | 'member';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      try {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (!token || !user) {
          router.push('/login');
          setIsLoading(false);
          return;
        }

        // Check if token is expired
        if (isTokenExpired(token)) {
          console.log('Token expired, redirecting to login');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
          setIsLoading(false);
          return;
        }

        try {
          const userData = JSON.parse(user);
          
          // Validate user data structure
          if (!userData || !userData.role || !userData.id) {
            // Invalid user data structure, clear it
            console.error('Invalid user data structure:', userData);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            router.push('/login');
            setIsLoading(false);
            return;
          }
          
          // Check role if required
          if (requiredRole && userData.role !== requiredRole) {
            // Redirect to appropriate dashboard
            if (userData.role === 'leader') {
              router.push('/leader/dashboard');
            } else if (userData.role === 'member') {
              router.push('/member/dashboard');
            } else {
              // Unknown role, redirect to login
              router.push('/login');
            }
            setIsLoading(false);
            return;
          }

          setIsAuthenticated(true);
        } catch (parseError) {
          console.error('Error parsing user data:', parseError);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
        }
      } catch (error) {
        // localStorage might not be available
        console.error('Error accessing localStorage:', error);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router, requiredRole]);

  if (isLoading) {
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

  return <>{children}</>;
}
