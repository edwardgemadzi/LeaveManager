'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarIcon,
  SunIcon,
  MoonIcon,
  ChatBubbleLeftRightIcon,
  HomeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  UsersIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  ScaleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { clearStoredUser, LEAVE_MANAGER_USER_STORAGE_EVENT } from '@/lib/clientUserStorage';

interface User {
  id: string;
  username: string;
  role: 'leader' | 'member';
  teamId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  /** When set (e.g. subgrouping enabled), shown beside role in the top bar. */
  subgroupTag?: string;
}

function displayNameForNav(user: User): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first || last) {
    return [first, last].filter(Boolean).join(' ');
  }
  const legacy = user.fullName?.trim();
  if (legacy) return legacy;
  return user.username;
}

function roleLabel(role: User['role']): string {
  return role === 'leader' ? 'Leader' : 'Member';
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const readUser = () => {
      const userData = localStorage.getItem('user');
      if (userData) {
        try {
          setUser(JSON.parse(userData));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    readUser();

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'user') readUser();
    };
    const onLocalUpdate = () => readUser();

    window.addEventListener('storage', onStorage);
    window.addEventListener(LEAVE_MANAGER_USER_STORAGE_EVENT, onLocalUpdate);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LEAVE_MANAGER_USER_STORAGE_EVENT, onLocalUpdate);
    };
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort cookie cleanup
    } finally {
      clearStoredUser();
      setUser(null);
      router.push('/login');
    }
  };

  if (!user) return null;

  const isActiveRoute = (route: string) =>
    pathname === route || pathname?.startsWith(route + '/');

  const leaderLinks = [
    { href: '/leader/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { href: '/leader/requests', label: 'Requests', Icon: DocumentTextIcon },
    { href: '/leader/calendar', label: 'Calendar', Icon: CalendarIcon },
    { href: '/leader/analytics', label: 'Analytics', Icon: ChartBarIcon },
    { href: '/leader/members', label: 'Members', Icon: UsersIcon },
    { href: '/leader/leave-balance', label: 'Leave balance', Icon: ScaleIcon },
    { href: '/leader/settings', label: 'Settings', Icon: Cog6ToothIcon },
    { href: '/leader/profile', label: 'Profile', Icon: UserCircleIcon },
  ];

  const memberLinks = [
    { href: '/member/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { href: '/member/requests', label: 'Requests', Icon: DocumentTextIcon },
    { href: '/member/calendar', label: 'Calendar', Icon: CalendarIcon },
    { href: '/member/analytics', label: 'Analytics', Icon: ChartBarIcon },
    { href: '/member/profile', label: 'Profile', Icon: UserCircleIcon },
  ];

  const navLinks = user.role === 'leader' ? leaderLinks : memberLinks;

  const dashboardHref = user.role === 'leader' ? '/leader/dashboard' : '/member/dashboard';
  const profileHref = user.role === 'leader' ? '/leader/profile' : '/member/profile';
  const navDisplayName = displayNameForNav(user);

  return (
    <>
      {/* Desktop: full-width app bar (brand only) */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 z-[60] h-14 items-center border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/60 backdrop-blur-nav">
        <div className="w-full pl-6 pr-6 lg:pl-[7.5rem] flex items-center justify-between gap-4 min-w-0">
          <Link href={dashboardHref} className="flex items-center gap-2.5 group min-w-0" title="Leave Manager">
            <CalendarIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors" />
            <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
              Leave Manager
            </span>
          </Link>
          <Link
            href={profileHref}
            className="shrink-0 text-right min-w-0 max-w-[min(100%,22rem)] pl-2"
            title="Your profile"
          >
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {navDisplayName}
            </span>
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{roleLabel(user.role)}</span>
              {user.subgroupTag ? (
                <span
                  className="inline-flex max-w-[12rem] rounded-md border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/90 dark:bg-indigo-950/35 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 dark:text-indigo-200 truncate"
                  title={`Subgroup: ${user.subgroupTag}`}
                >
                  {user.subgroupTag}
                </span>
              ) : null}
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile / tablet: top bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-nav border-b border-zinc-200/80 dark:border-zinc-800/80 w-full lg:hidden">
        <div className="w-full px-4 sm:px-6">
          <div className="flex items-center justify-between gap-2 h-14 w-full min-w-0">
            <Link href={dashboardHref} className="flex items-center gap-2 group min-w-0 shrink">
              <CalendarIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 transition-colors shrink-0" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hidden sm:block truncate">Leave Manager</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
              <Link
                href={profileHref}
                className="text-right min-w-0 max-w-[7.5rem] sm:max-w-[11rem] md:max-w-[14rem]"
                title="Your profile"
              >
                <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                  {navDisplayName}
                </span>
                <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{roleLabel(user.role)}</span>
                  {user.subgroupTag ? (
                    <span
                      className="inline-flex max-w-[6.5rem] sm:max-w-[9rem] rounded border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/90 dark:bg-indigo-950/35 px-1 py-px text-[9px] font-semibold text-indigo-800 dark:text-indigo-200 truncate"
                      title={`Subgroup: ${user.subgroupTag}`}
                    >
                      {user.subgroupTag}
                    </span>
                  ) : null}
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Toggle dark mode"
                  type="button"
                >
                  {theme === 'light' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  aria-label="Log out"
                  title="Log out"
                  type="button"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" />
                  <span className="text-[10px] font-semibold leading-none">Log out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Desktop: vertical left rail (icons only; brand is on top bar) */}
      <nav className="hidden lg:flex fixed top-14 left-0 bottom-0 z-50 w-24 border-r border-zinc-200/80 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-nav">
        <div className="flex flex-col items-center w-full py-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            {navLinks.map(({ href, label, Icon }) => {
              const active = isActiveRoute(href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-white' : ''}`} />
                </Link>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 pb-3">
            <Link
              href="/contact"
              className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
              title="Contact Developer"
            >
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
            </Link>
            <button
              onClick={toggleTheme}
              className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
              aria-label="Toggle dark mode"
              title="Theme"
            >
              {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleLogout}
              className="w-12 h-12 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
              title="Logout"
              aria-label="Logout"
            >
              <span className="text-xs font-semibold">Out</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
