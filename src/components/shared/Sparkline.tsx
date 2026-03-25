import React from 'react';

type Datum = number | null | undefined;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  strokeWidth = 2,
  className = '',
  color = 'currentColor',
  fill = 'none',
}: {
  data: Datum[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  fill?: string;
}) {
  const values = data.filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;

  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => {
    const x = i * stepX;
    if (typeof d !== 'number' || !Number.isFinite(d)) return { x, y: height / 2, valid: false };
    const t = (d - min) / range;
    const y = height - t * height;
    return { x, y: clamp(y, 0, height), valid: true };
  });

  const segments: string[] = [];
  let started = false;
  for (const p of points) {
    if (!p.valid) {
      started = false;
      continue;
    }
    if (!started) {
      segments.push(`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
      started = true;
    } else {
      segments.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }
  }

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={['max-w-full shrink-0', className].filter(Boolean).join(' ')}
      style={{ maxWidth: width }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={segments.join(' ')} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

