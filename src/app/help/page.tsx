'use client';

import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import MobileBottomNav from '@/components/shared/MobileBottomNav';
import { BookOpenIcon, ChartBarIcon, LifebuoyIcon } from '@heroicons/react/24/outline';

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 pb-20 lg:pb-0">
      <Navbar />
      <MobileBottomNav />
      <div className="container mx-auto px-4 py-8 pt-24 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Help Center</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Learn how to use Leave Manager quickly, from onboarding to approvals and analytics.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Link
            href="/help/metrics"
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-indigo-400 transition-colors"
          >
            <div className="flex items-start gap-3">
              <ChartBarIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Metric Glossary</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Understand every dashboard and analytics stat, including carryover and risk indicators.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/contact"
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-indigo-400 transition-colors"
          >
            <div className="flex items-start gap-3">
              <LifebuoyIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Contact Support</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  Still stuck? Contact the developer directly by email or Telegram.
                </p>
              </div>
            </div>
          </Link>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpenIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Getting Started</h2>
            </div>
            <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
              <li>1. Sign in with your username or email.</li>
              <li>2. Complete your profile details and timezone.</li>
              <li>3. Configure notification preferences (email/Telegram optional).</li>
              <li>4. For members: create leave requests from Requests or Calendar.</li>
              <li>5. For leaders: review pending requests and monitor analytics.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Request Lifecycle</h2>
            <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
              <li><strong>Pending:</strong> waiting for leader decision.</li>
              <li><strong>Approved:</strong> counts against leave balance and appears on calendar.</li>
              <li><strong>Rejected:</strong> does not affect leave balance.</li>
              <li><strong>Deleted/Restored:</strong> soft-delete history is preserved for audit.</li>
              <li><strong>Historical Submission:</strong> used for past entries that need leader approval (if enabled by team settings).</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
