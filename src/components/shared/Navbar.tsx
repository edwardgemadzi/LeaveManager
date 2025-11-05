'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CalendarIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

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
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-gray-900/50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href={user.role === 'leader' ? '/leader/dashboard' : '/member/dashboard'} 
                  className="text-2xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 flex items-center space-x-2">
              <CalendarIcon className="h-7 w-7 text-gray-700 dark:text-gray-300" />
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
                            <Link 
                              href="/leader/dashboard" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/dashboard' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Dashboard
                            </Link>
                            <Link 
                              href="/leader/leave-balance" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/leave-balance' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Leave Balance
                            </Link>
                            <Link 
                              href="/leader/analytics" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/analytics' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Analytics
                            </Link>
                            <Link 
                              href="/leader/requests" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/requests' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Requests
                            </Link>
                            <Link 
                              href="/leader/calendar" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/calendar' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Calendar
                            </Link>
                            <Link 
                              href="/leader/members" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/members' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Members
                            </Link>
                            <Link 
                              href="/leader/settings" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/settings' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Settings
                            </Link>
                            <Link 
                              href="/leader/profile" 
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                pathname === '/leader/profile' 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              Profile
                            </Link>
                          </>
                        ) : (
                  <>
                    <Link 
                      href="/member/dashboard" 
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                        pathname === '/member/dashboard' 
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      Dashboard
                    </Link>
                    <Link 
                      href="/member/requests" 
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                        pathname === '/member/requests' 
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      My Requests
                    </Link>
                    <Link 
                      href="/member/calendar" 
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                        pathname === '/member/calendar' 
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      Calendar
                    </Link>
                    <Link 
                      href="/member/profile" 
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200 ${
                        pathname === '/member/profile' 
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' 
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      Profile
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="hidden lg:flex items-center space-x-3 ml-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors duration-200"
                aria-label="Toggle dark mode"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  <MoonIcon className="h-5 w-5" />
                ) : (
                  <SunIcon className="h-5 w-5" />
                )}
              </button>
              <div className="bg-gray-100 dark:bg-gray-900 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {user.username} ({user.role})
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition-colors duration-200"
              >
                Logout
              </button>
            </div>

            <div className="lg:hidden ml-2 flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors duration-200"
                aria-label="Toggle dark mode"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  <MoonIcon className="h-5 w-5" />
                ) : (
                  <SunIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors duration-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="lg:hidden bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 shadow-lg">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {user.role === 'leader' ? (
                <>
                  <Link href="/leader/dashboard" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/dashboard' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900'}`}>
                    Dashboard
                  </Link>
                  <Link href="/leader/leave-balance" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/leave-balance' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Leave Balance
                  </Link>
                  <Link href="/leader/analytics" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/analytics' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Analytics
                  </Link>
                  <Link href="/leader/requests" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/requests' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Requests
                  </Link>
                  <Link href="/leader/calendar" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Calendar
                  </Link>
                  <Link href="/leader/members" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/members' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Members
                  </Link>
                  <Link href="/leader/settings" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/settings' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Settings
                  </Link>
                  <Link href="/leader/profile" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/leader/profile' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Profile
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/member/dashboard" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/member/dashboard' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900'}`}>
                    Dashboard
                  </Link>
                  <Link href="/member/requests" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/member/requests' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    My Requests
                  </Link>
                  <Link href="/member/calendar" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/member/calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Calendar
                  </Link>
                  <Link href="/member/profile" onClick={() => setIsOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${pathname === '/member/profile' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Profile
                  </Link>
                </>
              )}
              
              {/* User info and logout section */}
              <div className="border-t border-gray-200 dark:border-gray-800 mt-2 pt-2">
                <div className="px-4 py-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Logged in as: <span className="font-medium text-gray-700 dark:text-gray-300">{user.username}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Role: <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{user.role}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full mx-2 mb-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-200"
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
