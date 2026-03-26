'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  HomeIcon,
  DocumentTextIcon,
  CalendarIcon,
  ChartBarIcon,
  UserCircleIcon,
  UsersIcon,
  InboxStackIcon,
  EllipsisHorizontalCircleIcon,
  ChartPieIcon,
  ScaleIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  CalendarIcon as CalendarIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  UserCircleIcon as UserCircleIconSolid,
  UsersIcon as UsersIconSolid,
  InboxStackIcon as InboxStackIconSolid,
} from '@heroicons/react/24/solid';
import { clearStoredUser } from '@/lib/clientUserStorage';

interface NavUser {
  id: string;
  username: string;
  role: 'leader' | 'member';
}

const memberTabs = [
  { href: '/member/dashboard', label: 'Home', Icon: HomeIcon, IconSolid: HomeIconSolid },
  { href: '/member/requests', label: 'Requests', Icon: DocumentTextIcon, IconSolid: DocumentTextIconSolid },
  { href: '/member/calendar', label: 'Calendar', Icon: CalendarIcon, IconSolid: CalendarIconSolid },
  { href: '/member/profile', label: 'Profile', Icon: UserCircleIcon, IconSolid: UserCircleIconSolid },
];

const leaderTabs = [
  { href: '/leader/dashboard', label: 'Home', Icon: HomeIcon, IconSolid: HomeIconSolid },
  { href: '/leader/requests', label: 'Requests', Icon: InboxStackIcon, IconSolid: InboxStackIconSolid },
  { href: '/leader/calendar', label: 'Calendar', Icon: CalendarIcon, IconSolid: CalendarIconSolid },
  { href: '/leader/members', label: 'Members', Icon: UsersIcon, IconSolid: UsersIconSolid },
];

const leaderMoreItems = [
  { href: '/leader/analytics', label: 'Analytics', Icon: ChartPieIcon },
  { href: '/leader/leave-balance', label: 'Leave Balance', Icon: ScaleIcon },
  { href: '/leader/settings', label: 'Settings', Icon: Cog6ToothIcon },
  { href: '/leader/profile', label: 'Profile', Icon: UserCircleIcon },
  { href: '/help', label: 'Help Center', Icon: QuestionMarkCircleIcon },
  { href: '/contact', label: 'Contact Developer', Icon: ChatBubbleLeftRightIcon },
];

const memberMoreItems = [
  { href: '/member/analytics', label: 'Analytics', Icon: ChartBarIcon },
  { href: '/help', label: 'Help Center', Icon: QuestionMarkCircleIcon },
  { href: '/contact', label: 'Contact Developer', Icon: ChatBubbleLeftRightIcon },
];

export default function MobileBottomNav() {
  const [user, setUser] = useState<NavUser | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setMoreOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* best-effort */ }
    clearStoredUser();
    router.push('/login');
  }, [router]);

  if (!user) return null;

  const isLeader = user.role === 'leader';
  const tabs = isLeader ? leaderTabs : memberTabs;
  const moreItems = isLeader ? leaderMoreItems : memberMoreItems;

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  // For leader, "More" tab is active when any more-item route is active
  const isMoreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {/* More sheet backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-out ${
          moreOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Sheet handle */}
        <div className="bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-800 shadow-2xl">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
          </div>

          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-6 pt-2 pb-3">
            More
          </p>

          <nav className="px-4 pb-4 space-y-1">
            {moreItems.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive(href)
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-900/20 transition-all duration-150"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-t border-gray-200/80 dark:border-gray-800/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-stretch h-16">
          {tabs.map(({ href, label, Icon, IconSolid }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 transition-all duration-150 active:scale-95"
              >
                {active ? (
                  <IconSolid className="h-6 w-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                ) : (
                  <Icon className="h-6 w-6 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                )}
                <span
                  className={`text-[10px] font-semibold truncate leading-none ${
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 transition-all duration-150 active:scale-95"
          >
            <EllipsisHorizontalCircleIcon
              className={`h-6 w-6 flex-shrink-0 ${
                isMoreActive || moreOpen
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            />
            <span
              className={`text-[10px] font-semibold truncate leading-none ${
                isMoreActive || moreOpen
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
