'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isWorkingDay } from '@/lib/leaveCalculations';
import { LeaveRequest, Team, User } from '@/types';
import {
  SparklesIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';

// ─── types ────────────────────────────────────────────────────────────────────

interface Block {
  startDate: string;
  endDate: string;
  days: number;
  selected: boolean;
}

type Distribution = 'even' | 'frontload' | 'backload' | 'random';
type BlockStyle = 'singles' | 'blocks' | 'mixed';

interface AutoFillOptions {
  daysToFill: number;
  rangeStart: string;
  rangeEnd: string;
  distribution: Distribution;
  blockStyle: BlockStyle;
  blockMin: number;
  blockMax: number;
  excludedMonths: number[];
  excludedDays: number[]; // 0=Sun, 1=Mon … 6=Sat
}

type Step = 'customise' | 'preview' | 'result';

export interface MemberAutoFillModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User;
  team: Team;
  allRequests: LeaveRequest[];
  teamMembers: User[];
  remainingBalance: number;
  onApplied: () => void;
  /** If provided, "View in Calendar" calls this instead of navigating away */
  onPreview?: (blocks: Array<{ startDate: string; endDate: string }>) => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (start === end) return `${months[s.getMonth()]} ${s.getDate()}`;
  if (s.getMonth() === e.getMonth()) return `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
}

function groupConsecutive(days: string[]): Block[] {
  if (!days.length) return [];
  const blocks: Block[] = [];
  let start = days[0];
  let end = days[0];
  let count = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + 'T00:00:00');
    const curr = new Date(days[i] + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) { end = days[i]; count++; }
    else { blocks.push({ startDate: start, endDate: end, days: count, selected: true }); start = days[i]; end = days[i]; count = 1; }
  }
  blocks.push({ startDate: start, endDate: end, days: count, selected: true });
  return blocks;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── algorithm ────────────────────────────────────────────────────────────────

function generateMemberPlan(
  member: User,
  opts: AutoFillOptions,
  poolMemberIds: string[],
  allRequests: LeaveRequest[],
  team: Team,
): { days: string[]; available: number } {
  if (!member.shiftSchedule) return { days: [], available: 0 };

  const needed = opts.daysToFill;
  if (needed <= 0) return { days: [], available: 0 };

  const rangeStart = new Date(opts.rangeStart + 'T00:00:00');
  const rangeEnd = new Date(opts.rangeEnd + 'T00:00:00');

  // Pre-build sets for fast lookup
  const memberLeaveSet = new Set<string>();
  const poolLeaveMap = new Map<string, number>();

  for (const req of allRequests) {
    if (req.status !== 'approved') continue;
    const uid = String(req.userId);
    const isMember = uid === String(member._id);
    const isPool = poolMemberIds.includes(uid);
    if (!isMember && !isPool) continue;

    const reqStart = new Date(req.startDate);
    const reqEnd = new Date(req.endDate);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(0, 0, 0, 0);

    for (let d = new Date(reqStart); d <= reqEnd; d.setDate(d.getDate() + 1)) {
      const ymd = toYMD(d);
      if (isMember) memberLeaveSet.add(ymd);
      if (isPool && !isMember) poolLeaveMap.set(ymd, (poolLeaveMap.get(ymd) ?? 0) + 1);
    }
  }

  const holidaySet = new Set<string>();
  if (team.settings.enforceHolidayBlocking && team.settings.holidays) {
    for (const h of team.settings.holidays) holidaySet.add(h.date);
  }

  // Build available days pool
  const available: string[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const ymd = toYMD(d);

    if (opts.excludedMonths.includes(d.getMonth())) continue;
    if (opts.excludedDays.includes(d.getDay())) continue;
    if (!isWorkingDay(d, member.shiftSchedule)) continue;
    if (memberLeaveSet.has(ymd)) continue;
    if (holidaySet.has(ymd)) continue;

    const blackout = team.settings.blackoutDates?.some(
      (bd) => ymd >= bd.startDate && ymd <= bd.endDate
    );
    if (blackout) continue;

    const onLeave = poolLeaveMap.get(ymd) ?? 0;
    if (onLeave >= team.settings.concurrentLeave) continue;

    available.push(ymd);
  }

  const cap = Math.min(needed, available.length);
  if (cap === 0) return { days: [], available: available.length };

  // Apply distribution to get ordered/shuffled pool
  let pool: string[];
  if (opts.distribution === 'frontload') {
    pool = available;
  } else if (opts.distribution === 'backload') {
    pool = [...available].reverse();
  } else if (opts.distribution === 'random') {
    pool = shuffleArray(available);
  } else {
    // even — use step selection
    pool = available;
  }

  // Apply block style selection
  if (opts.blockStyle === 'singles' || opts.distribution === 'random') {
    // Just pick days from the pool
    if (opts.distribution === 'even' && opts.blockStyle === 'singles') {
      return { days: selectEvenly(available, cap), available: available.length };
    }
    return { days: pool.slice(0, cap), available: available.length };
  }

  if (opts.blockStyle === 'blocks') {
    return { days: selectBlocks(pool, cap, opts.blockMin, opts.blockMax, available), available: available.length };
  }

  // mixed — alternate blocks and singles
  return { days: selectMixed(pool, cap, opts.blockMin, opts.blockMax, available, opts.distribution === 'even'), available: available.length };
}

function selectEvenly(available: string[], needed: number): string[] {
  if (available.length === needed) return [...available];
  const selected: string[] = [];
  const step = available.length / needed;
  for (let i = 0; i < needed; i++) {
    const idx = Math.min(Math.round(i * step), available.length - 1);
    selected.push(available[idx]);
  }
  return selected;
}

function selectBlocks(pool: string[], needed: number, blockMin: number, blockMax: number, available: string[]): string[] {
  // Build a set for O(1) lookup
  const availSet = new Set(available);
  const selected: string[] = [];
  const usedSet = new Set<string>();
  let i = 0;

  while (selected.length < needed && i < pool.length) {
    const day = pool[i];
    if (usedSet.has(day)) { i++; continue; }

    // Try to extend a block starting at this day
    const block: string[] = [day];
    const dayDate = new Date(day + 'T00:00:00');
    for (let offset = 1; offset < blockMax && block.length < blockMax; offset++) {
      const next = new Date(dayDate);
      next.setDate(next.getDate() + offset);
      const nextYMD = toYMD(next);
      if (availSet.has(nextYMD) && !usedSet.has(nextYMD)) block.push(nextYMD);
      else break;
    }

    // Only use if we can form at least blockMin consecutive days
    const blockToUse = block.slice(0, Math.min(block.length, needed - selected.length));
    if (blockToUse.length >= blockMin || selected.length + blockToUse.length >= needed) {
      for (const d of blockToUse) { selected.push(d); usedSet.add(d); }
    }
    i++;
  }

  // If we still need more days, fill with singles from remaining available
  if (selected.length < needed) {
    for (const d of available) {
      if (selected.length >= needed) break;
      if (!usedSet.has(d)) selected.push(d);
    }
  }

  return selected.sort();
}

function selectMixed(pool: string[], needed: number, blockMin: number, blockMax: number, available: string[], useEven: boolean): string[] {
  const availSet = new Set(available);
  const selected: string[] = [];
  const usedSet = new Set<string>();
  let wantBlock = true;
  let i = 0;

  while (selected.length < needed && i < pool.length) {
    const day = pool[i];
    if (usedSet.has(day)) { i++; continue; }

    if (wantBlock) {
      const block: string[] = [day];
      const dayDate = new Date(day + 'T00:00:00');
      for (let offset = 1; offset < blockMax && block.length < blockMax; offset++) {
        const next = new Date(dayDate);
        next.setDate(next.getDate() + offset);
        const nextYMD = toYMD(next);
        if (availSet.has(nextYMD) && !usedSet.has(nextYMD)) block.push(nextYMD);
        else break;
      }
      const blockToUse = block.slice(0, Math.min(block.length, needed - selected.length));
      if (blockToUse.length >= blockMin) {
        for (const d of blockToUse) { selected.push(d); usedSet.add(d); }
        wantBlock = false;
      } else {
        // Block not long enough — fall through to single
        selected.push(day); usedSet.add(day); wantBlock = false;
      }
    } else {
      selected.push(day); usedSet.add(day); wantBlock = true;
    }
    i++;
  }

  // Fill remainder
  if (selected.length < needed) {
    for (const d of (useEven ? selectEvenly(available, needed) : available)) {
      if (selected.length >= needed) break;
      if (!usedSet.has(d)) selected.push(d);
    }
  }

  return selected.sort();
}

// ─── sub-components ───────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            value === o.value
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
          }`}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function MemberAutoFillModal({
  open,
  onClose,
  currentUser,
  team,
  allRequests,
  teamMembers,
  remainingBalance,
  onApplied,
  onPreview,
}: MemberAutoFillModalProps) {
  const noticePeriod = team.settings.minimumNoticePeriod || 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() + noticePeriod + 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);

  const defaultOpts: AutoFillOptions = {
    daysToFill: Math.max(1, Math.round(remainingBalance)),
    rangeStart: toYMD(defaultStart),
    rangeEnd: toYMD(yearEnd),
    distribution: 'even',
    blockStyle: 'singles',
    blockMin: 2,
    blockMax: 5,
    excludedMonths: [],
    excludedDays: [],
  };

  const router = useRouter();
  const [step, setStep] = useState<Step>('customise');
  const [opts, setOpts] = useState<AutoFillOptions>(defaultOpts);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; scheduled: number; message: string } | null>(null);

  const poolMemberIds = teamMembers.map((m) => String(m._id));

  const generatePreview = useCallback(() => {
    const { days, available } = generateMemberPlan(
      currentUser,
      opts,
      poolMemberIds,
      allRequests,
      team,
    );
    setBlocks(groupConsecutive(days));
    setAvailableCount(available);
    setStep('preview');
  }, [currentUser, opts, poolMemberIds, allRequests, team]);

  const regenerate = useCallback(() => {
    const { days, available } = generateMemberPlan(
      currentUser,
      opts,
      poolMemberIds,
      allRequests,
      team,
    );
    setBlocks(groupConsecutive(days));
    setAvailableCount(available);
  }, [currentUser, opts, poolMemberIds, allRequests, team]);

  function toggleBlock(i: number) {
    setBlocks((prev) => prev.map((b, idx) => idx === i ? { ...b, selected: !b.selected } : b));
  }

  async function apply() {
    const segments = blocks.filter((b) => b.selected).map((b) => ({
      startDate: b.startDate,
      endDate: b.endDate,
    }));
    if (!segments.length) return;

    setApplying(true);
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Annual leave (auto-scheduled)',
          segments,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const scheduled = (data.createdRequests?.length ?? segments.length);
        setResult({ ok: true, scheduled, message: `${scheduled} leave block${scheduled !== 1 ? 's' : ''} submitted successfully.` });
        onApplied();
      } else {
        setResult({ ok: false, scheduled: 0, message: data.error || 'Something went wrong. Please try again.' });
      }
    } catch {
      setResult({ ok: false, scheduled: 0, message: 'Network error. Please try again.' });
    } finally {
      setApplying(false);
      setStep('result');
    }
  }

  function handleClose() {
    setStep('customise');
    setOpts(defaultOpts);
    setBlocks([]);
    setResult(null);
    onClose();
  }

  const selectedDays = blocks.filter((b) => b.selected).reduce((s, b) => s + b.days, 0);
  const selectedBlocks = blocks.filter((b) => b.selected).length;
  const minDate = toYMD(defaultStart);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start gap-3">
            {step === 'preview' && (
              <button
                onClick={() => setStep('customise')}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mt-0.5 shrink-0"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
              <SparklesIcon className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {step === 'customise' ? 'Auto-fill My Leave' : step === 'preview' ? 'Preview' : 'Done'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {step === 'customise'
                  ? 'Customise how you want your remaining days spread'
                  : step === 'preview'
                  ? `${selectedDays} day${selectedDays !== 1 ? 's' : ''} across ${selectedBlocks} block${selectedBlocks !== 1 ? 's' : ''} — tap any to deselect`
                  : 'Your leave has been submitted'}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Step: customise ── */}
          {step === 'customise' && (
            <div className="space-y-5">
              {remainingBalance <= 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Your leave balance is 0. You can still preview suggestions, but there may be nothing to fill.
                  </p>
                </div>
              )}

              {/* Days to fill */}
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Days to fill
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, Math.round(remainingBalance))}
                    value={opts.daysToFill}
                    onChange={(e) => setOpts((o) => ({ ...o, daysToFill: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="input-modern w-24 text-center"
                  />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    of {Math.round(remainingBalance)} remaining
                  </span>
                  {opts.daysToFill !== Math.max(1, Math.round(remainingBalance)) && (
                    <button
                      type="button"
                      onClick={() => setOpts((o) => ({ ...o, daysToFill: Math.max(1, Math.round(remainingBalance)) }))}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Use all
                    </button>
                  )}
                </div>
              </div>

              {/* Date range */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Date range</label>
                  <button
                    type="button"
                    onClick={() => setOpts((o) => ({ ...o, rangeStart: minDate, rangeEnd: toYMD(yearEnd) }))}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Full year
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">From</p>
                    <input
                      type="date"
                      min={minDate}
                      max={opts.rangeEnd}
                      value={opts.rangeStart}
                      onChange={(e) => setOpts((o) => ({ ...o, rangeStart: e.target.value }))}
                      className="input-modern w-full text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">To</p>
                    <input
                      type="date"
                      min={opts.rangeStart}
                      max={toYMD(yearEnd)}
                      value={opts.rangeEnd}
                      onChange={(e) => setOpts((o) => ({ ...o, rangeEnd: e.target.value }))}
                      className="input-modern w-full text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Distribution */}
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Distribution
                </label>
                <SegmentControl<Distribution>
                  value={opts.distribution}
                  onChange={(v) => setOpts((o) => ({ ...o, distribution: v }))}
                  options={[
                    { value: 'even', label: 'Even spread', hint: 'Space days out equally across the range' },
                    { value: 'frontload', label: 'Front-load', hint: 'Use earliest available dates first' },
                    { value: 'backload', label: 'Back-load', hint: 'Save days for later in the range' },
                    { value: 'random', label: 'Random', hint: 'Pick days at random' },
                  ]}
                />
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {opts.distribution === 'even' && 'Days will be spaced out evenly across your chosen range.'}
                  {opts.distribution === 'frontload' && 'Earliest available dates will be picked first.'}
                  {opts.distribution === 'backload' && 'Days will be pushed toward the end of your range.'}
                  {opts.distribution === 'random' && 'Dates are picked randomly — regenerate in the preview to get different results.'}
                </p>
              </div>

              {/* Leave style */}
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Leave style
                </label>
                <SegmentControl<BlockStyle>
                  value={opts.blockStyle}
                  onChange={(v) => setOpts((o) => ({ ...o, blockStyle: v }))}
                  options={[
                    { value: 'singles', label: 'Single days' },
                    { value: 'blocks', label: 'Multi-day blocks' },
                    { value: 'mixed', label: 'Mix' },
                  ]}
                />
                {opts.blockStyle !== 'singles' && (
                  <div className="mt-2.5 flex items-center gap-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Block size</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={opts.blockMax}
                        value={opts.blockMin}
                        onChange={(e) => setOpts((o) => ({ ...o, blockMin: Math.max(2, parseInt(e.target.value) || 2) }))}
                        className="input-modern w-16 text-center text-sm"
                      />
                      <span className="text-xs text-zinc-400">–</span>
                      <input
                        type="number"
                        min={opts.blockMin}
                        max={14}
                        value={opts.blockMax}
                        onChange={(e) => setOpts((o) => ({ ...o, blockMax: Math.max(opts.blockMin, parseInt(e.target.value) || opts.blockMin) }))}
                        className="input-modern w-16 text-center text-sm"
                      />
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">days</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Exclude months */}
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Exclude months <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MONTHS.map((m, i) => {
                    const isPast = i < new Date().getMonth();
                    const excluded = opts.excludedMonths.includes(i);
                    if (isPast) return null;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setOpts((o) => ({
                            ...o,
                            excludedMonths: excluded
                              ? o.excludedMonths.filter((x) => x !== i)
                              : [...o.excludedMonths, i],
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          excluded
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 line-through'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                {opts.excludedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpts((o) => ({ ...o, excludedMonths: [] }))}
                    className="mt-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Clear exclusions
                  </button>
                )}
              </div>

              {/* Exclude days of week */}
              <div>
                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                  Exclude days of week <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map(({ label, value }) => {
                    const excluded = opts.excludedDays.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setOpts((o) => ({
                            ...o,
                            excludedDays: excluded
                              ? o.excludedDays.filter((x) => x !== value)
                              : [...o.excludedDays, value],
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          excluded
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 line-through'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {opts.excludedDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpts((o) => ({ ...o, excludedDays: [] }))}
                    className="mt-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Clear exclusions
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step: preview ── */}
          {step === 'preview' && (
            <div className="space-y-3">
              {availableCount < opts.daysToFill && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Only {availableCount} slot{availableCount !== 1 ? 's' : ''} found in this range —
                    {availableCount === 0
                      ? ' all dates are blocked or excluded.'
                      : ` showing ${Math.min(availableCount, opts.daysToFill)} of the ${opts.daysToFill} days you wanted. Try widening your range or removing excluded months.`}
                  </p>
                </div>
              )}

              {blocks.length === 0 ? (
                <div className="py-10 text-center">
                  <ExclamationTriangleIcon className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No slots available</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    Try a wider date range or remove some excluded months.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('customise')}
                    className="mt-3 btn-secondary text-xs py-1.5 px-3"
                  >
                    Back to settings
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {blocks.map((block, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleBlock(i)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                          block.selected
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 line-through'
                        }`}
                      >
                        {formatRange(block.startDate, block.endDate)}
                        {block.days > 1 && (
                          <span className={`text-[10px] ${block.selected ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400'}`}>
                            · {block.days}d
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {selectedDays} day{selectedDays !== 1 ? 's' : ''} selected
                    </p>
                    <button
                      type="button"
                      onClick={regenerate}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                      Regenerate
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step: result ── */}
          {step === 'result' && result && (
            <div className={`rounded-xl p-4 flex items-start gap-3 ${
              result.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50'
            }`}>
              {result.ok
                ? <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                : <ExclamationTriangleIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {result.ok ? 'Leave submitted' : 'Submission failed'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{result.message}</p>
                {result.ok && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    Your requests are pending approval. Your leader will be notified.
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          {step === 'customise' && (
            <>
              <button onClick={handleClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              <button
                onClick={generatePreview}
                disabled={opts.daysToFill <= 0}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                Generate Preview
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('customise')} className="btn-secondary text-sm px-4 py-2">
                Back
              </button>
              <button
                onClick={() => {
                  const selectedBlocks = blocks.filter((b) => b.selected).map((b) => ({ startDate: b.startDate, endDate: b.endDate }));
                  if (onPreview) {
                    onPreview(selectedBlocks);
                    handleClose();
                  } else {
                    localStorage.setItem('autofill_preview', JSON.stringify(selectedBlocks));
                    router.push('/member/calendar');
                  }
                }}
                disabled={selectedDays === 0}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View in Calendar
              </button>
              <button
                onClick={apply}
                disabled={applying || selectedDays === 0}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying ? (
                  <><ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />Applying…</>
                ) : (
                  <><SparklesIcon className="h-3.5 w-3.5" />Apply {selectedDays} day{selectedDays !== 1 ? 's' : ''}</>
                )}
              </button>
            </>
          )}
          {step === 'result' && (
            <button onClick={handleClose} className="btn-primary text-sm px-4 py-2">Done</button>
          )}
        </div>

      </div>
    </div>
  );
}
