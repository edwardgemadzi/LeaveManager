/**
 * Calendar-date helpers.
 *
 * Leave dates, blackout dates and shift rotation anchors are *calendar dates*
 * ("the 22nd of January"), not instants. JavaScript only has instants, so every
 * conversion has to pick a timezone, and picking the wrong one shifts the date
 * by a day. That is what made bookings fail for users in Zambia (UTC+2): the
 * browser and the server disagreed about which day a stored date meant.
 *
 * Two frames are in play:
 *  - the *local* frame, used for anything the user sees or clicks, so that
 *    getDay(), toLocaleDateString() and date arithmetic behave as expected;
 *  - the *stored* frame (UTC midnight), used for anything that crosses the wire
 *    or lands in the database, so that every reader resolves the same day.
 *
 * Use parseDateSafe/formatDateSafe for local work, and parseStoredDate/
 * toStoredDate at the persistence boundary.
 */

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a date into a local-midnight Date.
 *
 * A plain "YYYY-MM-DD" string is read literally: `new Date("2026-01-22")` is
 * defined to mean UTC midnight, which resolves to the 21st for anyone behind
 * UTC, so the parts are used directly instead.
 */
export const parseDateSafe = (dateInput: string | Date): Date => {
  if (dateInput instanceof Date) {
    // Already an instant in the local frame - just drop the time component.
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(dateInput);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const date = new Date(dateInput);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Format a date as YYYY-MM-DD from its local components.
 *
 * Never use toISOString() for this: in Zambia (UTC+2) a Date at local midnight
 * on the 22nd is 22:00Z on the 21st, so toISOString() yields "2026-01-21".
 */
export const formatDateSafe = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Resolve a value that came out of the database (or off the wire) to the
 * calendar date it denotes, returned as local midnight for downstream use.
 *
 * Stored values are read in UTC so that the browser and the server always agree.
 * Values are snapped to the nearest UTC midnight first, which recovers the
 * intended day from rows written before this normalisation existed: a client in
 * Zambia used to persist local midnight as "2026-01-04T22:00:00.000Z", which is
 * two hours from the 5th and twenty-two from the 4th, so it resolves back to the
 * 5th the leader actually picked. Any offset within +/-12h round-trips.
 */
export const parseStoredDate = (dateInput: string | Date): Date => {
  if (typeof dateInput === 'string') {
    const dateOnly = DATE_ONLY_PATTERN.exec(dateInput);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return new Date(NaN);
  }

  const snapped = new Date(Math.round(date.getTime() / MS_PER_DAY) * MS_PER_DAY);
  return new Date(snapped.getUTCFullYear(), snapped.getUTCMonth(), snapped.getUTCDate());
};

/**
 * Normalise a calendar date to UTC midnight for persistence, so it reads back
 * as the same day regardless of the reader's timezone.
 */
export const toStoredDate = (dateInput: string | Date): Date => {
  const local = parseStoredDate(dateInput);
  if (Number.isNaN(local.getTime())) {
    return new Date(NaN);
  }
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
};
