import React from 'react';

export type TimelineTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type TimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: TimelineTone;
  right?: React.ReactNode;
};

const toneDot: Record<TimelineTone, string> = {
  neutral: 'bg-zinc-300 dark:bg-zinc-700',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-indigo-500',
};

export function Timeline({
  items,
  className = '',
  empty,
}: {
  items: TimelineItem[];
  className?: string;
  empty?: React.ReactNode;
}) {
  if (!items.length) return <>{empty ?? null}</>;

  return (
    <div className={`divide-y divide-zinc-200/70 dark:divide-zinc-800/70 ${className}`}>
      {items.map((it) => (
        <div key={it.id} className="py-3 flex items-start gap-3">
          <div className="mt-1.5 flex flex-col items-center">
            <div className={`h-2.5 w-2.5 rounded-full ${toneDot[it.tone ?? 'neutral']}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{it.title}</p>
                {it.subtitle ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{it.subtitle}</p>
                ) : null}
              </div>
              {it.right ? <div className="shrink-0">{it.right}</div> : null}
            </div>
            {it.meta ? <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{it.meta}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

