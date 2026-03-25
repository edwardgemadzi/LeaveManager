import React from 'react';

export type ActivityTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type ActivityItem = {
  id: string;
  title: string;
  description?: string;
  time?: string;
  tone?: ActivityTone;
};

const tonePill: Record<ActivityTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
};

export function ActivityFeed({
  items,
  className = '',
  empty,
}: {
  items: ActivityItem[];
  className?: string;
  empty?: React.ReactNode;
}) {
  if (!items.length) return <>{empty ?? null}</>;

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-900/40 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{it.title}</p>
              {it.description ? <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{it.description}</p> : null}
            </div>
            {it.time ? (
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-md ${tonePill[it.tone ?? 'neutral']}`}>
                {it.time}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

