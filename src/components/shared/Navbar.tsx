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

  // Helper function to check if pathname matches a route
  const isActiveRoute = (route: string) => {
    return pathname === route || pathname?.startsWith(route + '/');
  };

  // Navigation links for leader
  const leaderLinks = [
    { href: '/leader/dashboard', label: 'Dashboard' },
    { href: '/leader/leave-balance', label: 'Leave Balance' },
    { href: '/leader/analytics', label: 'Analytics' },
    { href: '/leader/requests', label: 'Requests' },
    { href: '/leader/calendar', label: 'Calendar' },
    { href: '/leader/members', label: 'Members' },
    { href: '/leader/settings', label: 'Settings' },
    { href: '/leader/profile', label: 'Profile' },
  ];

  // Navigation links for member
  const memberLinks = [
    { href: '/member/dashboard', label: 'Dashboard' },
    { href: '/member/requests', label: 'My Requests' },
    { href: '/member/calendar', label: 'Calendar' },
    { href: '/member/profile', label: 'Profile' },
  ];

  const navLinks = user.role === 'leader' ? leaderLinks : memberLinks;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-nav border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 lg:h-18">
          {/* Logo Section - Enhanced with hover effects */}
          <div className="flex items-center">
            <Link 
              href={user.role === 'leader' ? '/leader/dashboard' : '/member/dashboard'} 
              className="group flex items-center space-x-2.5 transition-all duration-300 hover:scale-105"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <CalendarIcon className="relative h-7 w-7 lg:h-8 lg:w-8 text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors duration-300" />
              </div>
              <span className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-800 dark:from-indigo-400 dark:to-indigo-600 bg-clip-text text-transparent group-hover:from-indigo-700 group-hover:to-indigo-900 dark:group-hover:from-indigo-300 dark:group-hover:to-indigo-500 transition-all duration-300">
                Leave Manager
              </span>
            </Link>
          </div>

          {/* Desktop Navigation - Enhanced with backdrop blur and underline animation */}
          <div className="hidden lg:flex items-center space-x-2">
            <nav className="flex items-center space-x-1">
              {navLinks.map((link) => {
                const isActive = isActiveRoute(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {/* Active indicator with underline animation */}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 rounded-t-full animate-fade-in"></span>
                    )}
                    {/* Hover background */}
                    <span className={`absolute inset-0 rounded-lg transition-opacity duration-300 ${
                      isActive 
                        ? 'bg-indigo-50/50 dark:bg-indigo-900/20 opacity-100' 
                        : 'bg-gray-100/50 dark:bg-gray-800/50 opacity-0 hover:opacity-100'
                    }`}></span>
                    <span className="relative z-10">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Desktop User Actions - Enhanced */}
          <div className="hidden lg:flex items-center space-x-3 ml-6">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 hover:scale-110"
              aria-label="Toggle dark mode"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? (
                <MoonIcon className="h-5 w-5" />
              ) : (
                <SunIcon className="h-5 w-5" />
              )}
            </button>
            <div className="bg-gray-100/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-200/50 dark:border-gray-800/50 shadow-sm hover:shadow-md transition-all duration-200">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                <span className="text-indigo-600 dark:text-indigo-400">{user.username}</span>
                <span className="mx-1.5 text-gray-400 dark:text-gray-500">•</span>
                <span className="capitalize">{user.role}</span>
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 dark:from-red-700 dark:to-red-800 dark:hover:from-red-800 dark:hover:to-red-900 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
            >
              Logout
            </button>
          </div>

          {/* Mobile/Tablet Controls */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 active:scale-95"
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
              className={`p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 active:scale-95 ${
                isOpen ? 'bg-gray-100 dark:bg-gray-800' : ''
              }`}
              aria-label="Toggle menu"
            >
              <svg 
                className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile/Tablet Navigation Menu - Enhanced with smooth animations */}
        <div 
          className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200/50 dark:border-gray-800/50 shadow-lg">
            <nav className="px-2 pt-3 pb-4 space-y-1">
              {navLinks.map((link, index) => {
                const isActive = isActiveRoute(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 stagger-item ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold shadow-sm'
                        : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-800/80'
                    }`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    {link.label}
                  </Link>
                );
              })}
              
              {/* User info and logout section */}
              <div className="border-t border-gray-200/50 dark:border-gray-800/50 mt-3 pt-3">
                <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg mb-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Logged in as
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {user.username}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 capitalize">
                    {user.role}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full mx-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 dark:from-red-700 dark:to-red-800 dark:hover:from-red-800 dark:hover:to-red-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
                >
                  Logout
                </button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </nav>
  );
}
