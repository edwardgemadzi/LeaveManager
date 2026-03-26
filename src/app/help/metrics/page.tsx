'use client';

import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';

export default function MetricsGlossaryPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Metric Glossary</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Definitions for dashboard and analytics values used across Leave Manager.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Core Balance Metrics</h2>
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Remaining Balance:</strong> Leave days still available for use this year.</li>
            <li><strong>Base Balance:</strong> Standard yearly entitlement before carryover and manual adjustments.</li>
            <li><strong>Days Used:</strong> Approved leave already consumed in the selected year.</li>
            <li><strong>Carryover:</strong> Unused leave moved from previous year (if policy allows).</li>
            <li><strong>Will Lose:</strong> Estimated days that may expire if unused before year-end.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Planning and Risk Metrics</h2>
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Realistic Usable Days:</strong> Practical estimate of leave that can still be booked given constraints.</li>
            <li><strong>Competition:</strong> Pressure from overlapping leave requests within the relevant team/subgroup.</li>
            <li><strong>Risk Level:</strong> Summary of potential leave-loss or planning issues (low/medium/high).</li>
            <li><strong>Usage Efficiency:</strong> How effectively planned leave aligns with available allowance.</li>
            <li><strong>Planning Efficiency:</strong> How early requests are submitted versus required notice period.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Operational Metrics</h2>
          <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Pending Requests:</strong> Requests waiting for leader approval.</li>
            <li><strong>Approved Requests:</strong> Confirmed requests reflected in planning and balances.</li>
            <li><strong>Rejected Requests:</strong> Requests declined and excluded from leave usage totals.</li>
            <li><strong>Historical Pending:</strong> Past-date submissions awaiting review (when enabled by policy).</li>
          </ul>
        </div>

        <div className="mt-6">
          <Link href="/help" className="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline">
            Back to Help Center
          </Link>
        </div>
      </div>
    </div>
  );
}
