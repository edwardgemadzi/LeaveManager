'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={user.role === 'leader' ? '/leader/dashboard' : '/member/dashboard'} 
                  className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-all duration-300 flex items-center space-x-2">
              <span className="text-3xl">📅</span>
              <span>
                Leave Manager
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-1">
            <div className="hidden md:block">
              <div className="flex items-center space-x-1">
                        {user.role === 'leader' ? (
                          <>
                            <Link href="/leader/dashboard" className="nav-tab">
                              Dashboard
                            </Link>
                            <Link href="/leader/requests" className="nav-tab">
                              Requests
                            </Link>
                            <Link href="/leader/calendar" className="nav-tab">
                              Calendar
                            </Link>
                            <Link href="/leader/members" className="nav-tab">
                              Members
                            </Link>
                            <Link href="/leader/settings" className="nav-tab">
                              Settings
                            </Link>
                          </>
                        ) : (
                  <>
                    <Link href="/member/dashboard" className="nav-tab">
                      Dashboard
                    </Link>
                    <Link href="/member/requests" className="nav-tab">
                      My Requests
                    </Link>
                    <Link href="/member/calendar" className="nav-tab">
                      Calendar
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3 ml-4">
              <div className="hidden sm:block bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                <span className="text-xs font-medium text-gray-700">
                  {user.username} ({user.role})
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-500/80 hover:bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 backdrop-blur-sm border border-red-400/50 hover:border-red-300"
              >
                Logout
              </button>
            </div>

            <div className="md:hidden ml-2">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-white/90 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all duration-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden glass-dark border-t border-white/10">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {user.role === 'leader' ? (
                <>
                  <Link href="/leader/dashboard" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Dashboard
                  </Link>
                  <Link href="/leader/requests" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Requests
                  </Link>
                  <Link href="/leader/calendar" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Calendar
                  </Link>
                  <Link href="/leader/members" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Members
                  </Link>
                  <Link href="/leader/settings" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Settings
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/member/dashboard" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Dashboard
                  </Link>
                  <Link href="/member/requests" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    My Requests
                  </Link>
                  <Link href="/member/calendar" className="block px-4 py-3 text-white/90 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all duration-200">
                    Calendar
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
