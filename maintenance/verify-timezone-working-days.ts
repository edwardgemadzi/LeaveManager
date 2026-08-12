/**
 * Regression check for the Zambia (UTC+2) "not a working day" booking failure.
 *
 * Run under several timezones and assert every one agrees with UTC about which
 * days a rotating shift covers:
 *   for tz in UTC Africa/Lusaka Asia/Kathmandu America/New_York Pacific/Auckland; do
 *     TZ=$tz npx tsx maintenance/verify-timezone-working-days.ts
 *   done
 */
import { isWorkingDay } from '../src/lib/leaveCalculations';
import { formatDateSafe, parseDateSafe, parseStoredDate, toStoredDate } from '../src/lib/dateUtils';
import type { ShiftSchedule } from '../src/types';

const PATTERN = [true, true, true, true, false, false, false, false]; // 4 on / 4 off

// Anchors that all mean "5 January 2026", as written by clients in different zones.
// Legacy rows (written before anchors were normalised) carry the writer's local
// midnight, which nearest-midnight snapping recovers for any offset within +/-12h.
// Offsets beyond that (UTC+13/+14) are genuinely ambiguous from the instant alone
// and are excluded; those rows self-heal the next time the schedule is saved.
const ANCHORS: Array<[string, string]> = [
  ['UTC midnight (normalised)', '2026-01-05T00:00:00.000Z'],
  ['legacy write from UTC+2 (Zambia)', '2026-01-04T22:00:00.000Z'],
  ['legacy write from UTC+5:45', '2026-01-04T18:15:00.000Z'],
  ['legacy write from UTC-5 (New York)', '2026-01-05T05:00:00.000Z'],
  ['legacy write from UTC-11', '2026-01-05T11:00:00.000Z'],
  ['date-only string', '2026-01-05'],
];

// The rotation anchored on 5 Jan: 5-8 on, 9-12 off, 13-16 on, ...
const EXPECTED: Record<string, boolean> = {};
for (let day = 5; day <= 28; day++) {
  EXPECTED[`2026-01-${String(day).padStart(2, '0')}`] = PATTERN[(day - 5) % 8];
}

let failures = 0;
const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`\nTZ=${tz} (offset ${-new Date(2026, 0, 22).getTimezoneOffset() / 60}h)`);

// 1. Every spelling of the anchor must resolve to the same calendar day.
for (const [label, raw] of ANCHORS) {
  const resolved = formatDateSafe(parseStoredDate(raw));
  const ok = resolved === '2026-01-05';
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} anchor ${label.padEnd(34)} -> ${resolved}`);
}

// 2. isWorkingDay must match the expected rotation for every anchor spelling.
for (const [label, raw] of ANCHORS) {
  const schedule = { pattern: PATTERN, startDate: raw as unknown as Date, type: 'rotating' } as ShiftSchedule;
  const wrong = Object.entries(EXPECTED).filter(
    ([iso, want]) => isWorkingDay(parseDateSafe(iso), schedule) !== want
  );
  if (wrong.length) failures++;
  console.log(
    `  ${wrong.length ? 'FAIL' : 'ok  '} rotation ${label.padEnd(32)} ${
      wrong.length ? `${wrong.length} wrong day(s), first ${wrong[0][0]}` : 'all 24 days match'
    }`
  );
}

// 3. Round-tripping a picked date through storage must preserve the day.
let roundTripFailures = 0;
for (let day = 1; day <= 28; day++) {
  const picked = `2026-01-${String(day).padStart(2, '0')}`;
  const roundTripped = formatDateSafe(parseStoredDate(toStoredDate(picked).toISOString()));
  if (roundTripped !== picked) {
    roundTripFailures++;
    console.log(`  FAIL round-trip ${picked} -> ${roundTripped}`);
  }
}
failures += roundTripFailures;
console.log(`  ${roundTripFailures ? 'FAIL' : 'ok  '} round-trip 28 picked dates through storage`);

// 4. A fixed Mon-Fri schedule must call the same days working everywhere.
const fixed = {
  pattern: [true, true, true, true, true, false, false],
  startDate: '2026-01-05T00:00:00.000Z' as unknown as Date,
  type: 'fixed',
} as ShiftSchedule;
const weekend = ['2026-01-24', '2026-01-25'];
const weekdays = ['2026-01-22', '2026-01-23', '2026-01-26'];
const fixedOk =
  weekend.every((d) => !isWorkingDay(parseDateSafe(d), fixed)) &&
  weekdays.every((d) => isWorkingDay(parseDateSafe(d), fixed));
if (!fixedOk) failures++;
console.log(`  ${fixedOk ? 'ok  ' : 'FAIL'} fixed Mon-Fri schedule maps weekdays/weekend correctly`);

if (failures) {
  console.error(`\n${failures} check(s) failed under TZ=${tz}`);
  process.exit(1);
}
console.log(`  all checks passed under TZ=${tz}`);
