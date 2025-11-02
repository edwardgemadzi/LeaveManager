'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      
      if (token && user) {
        try {
          const userData = JSON.parse(user);
          // Validate user data structure
          if (userData && userData.role) {
            if (userData.role === 'leader') {
              router.push('/leader/dashboard');
              return;
            } else if (userData.role === 'member') {
              router.push('/member/dashboard');
              return;
            }
          } else {
            // Invalid user data, clear it
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
        } catch (parseError) {
          // Invalid JSON in localStorage, clear it
          console.error('Error parsing user data:', parseError);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
    } catch (error) {
      // localStorage might not be available (SSR)
      console.error('Error accessing localStorage:', error);
    } finally {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-center min-h-screen py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
              Leave Manager
            </h1>
            <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
              Streamline your team&apos;s leave management with our comprehensive solution for team leaders and members.
            </p>
            <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
              <div className="rounded-md shadow">
                <Link
                  href="/register-leader"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
                >
                  Create Team
                </Link>
              </div>
              <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                <Link
                  href="/register-member"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                >
                  Join Team
                </Link>
              </div>
            </div>
            <div className="mt-8">
              <Link
                href="/login"
                className="text-indigo-600 hover:text-indigo-500 font-medium"
              >
                Already have an account? Sign in →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}