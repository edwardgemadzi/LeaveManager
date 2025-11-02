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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
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
            <div className="hidden lg:block">
              <div className="flex items-center space-x-1">
                        {user.role === 'leader' ? (
                          <>
                            <Link href="/leader/dashboard" className="nav-tab">
                              Dashboard
                            </Link>
                            <Link href="/leader/leave-balance" className="nav-tab">
                              Leave Balance
                            </Link>
                            <Link href="/leader/analytics" className="nav-tab">
                              Analytics
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
                            <Link href="/leader/profile" className="nav-tab">
                              Profile
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
                    <Link href="/member/profile" className="nav-tab">
                      Profile
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
              <div className="hidden lg:block">
                <button
                  onClick={handleLogout}
                  className="bg-red-500/80 hover:bg-red-500 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 backdrop-blur-sm border border-red-400/50 hover:border-red-300"
                >
                  Logout
                </button>
              </div>
            </div>

            <div className="lg:hidden ml-2">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-600 hover:text-gray-900 p-2 rounded-xl hover:bg-gray-100 transition-all duration-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="lg:hidden bg-white border-t border-gray-200 shadow-lg">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {user.role === 'leader' ? (
                <>
                  <Link href="/leader/dashboard" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Dashboard
                  </Link>
                  <Link href="/leader/leave-balance" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Leave Balance
                  </Link>
                  <Link href="/leader/analytics" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Analytics
                  </Link>
                  <Link href="/leader/requests" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Requests
                  </Link>
                  <Link href="/leader/calendar" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Calendar
                  </Link>
                  <Link href="/leader/members" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Members
                  </Link>
                  <Link href="/leader/settings" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Settings
                  </Link>
                  <Link href="/leader/profile" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Profile
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/member/dashboard" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Dashboard
                  </Link>
                  <Link href="/member/requests" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    My Requests
                  </Link>
                  <Link href="/member/calendar" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Calendar
                  </Link>
                  <Link href="/member/profile" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200">
                    Profile
                  </Link>
                </>
              )}
              
              {/* User info and logout section */}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <div className="px-4 py-2">
                  <p className="text-xs text-gray-500 mb-2">
                    Logged in as: <span className="font-medium text-gray-700">{user.username}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Role: <span className="font-medium text-gray-700 capitalize">{user.role}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full mx-2 mb-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
