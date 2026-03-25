import React from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  className = '',
  trackClassName = 'text-zinc-200 dark:text-zinc-800',
  indicatorClassName = 'text-indigo-600 dark:text-indigo-400',
  label,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
  label?: React.ReactNode;
}) {
  const v = clamp(value, 0, 1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * v;
  const gap = c - dash;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={indicatorClassName}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={`${dash} ${gap}`}
        />
      </svg>
      {label ? <div className="absolute inset-0 flex items-center justify-center">{label}</div> : null}
    </div>
  );
}

