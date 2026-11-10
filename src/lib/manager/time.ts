/**
 * Local-time helpers for the manager.
 *
 * The product is ₹/IST-first: every "today", day key and time-of-day the
 * manager derives from a Date must use the reader's own zone, not UTC. UTC
 * slices put anything between 00:00 and 05:30 IST in the previous day and made
 * the "On shift" badge flip off for half the day.
 *
 * Components read the clock only after `useMounted` resolves, so on the client
 * these helpers run in the browser zone — exactly what the demo needs.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day as `yyyy-mm-dd` — the key shift/appointment buckets use. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time of day as `HH:mm` — comparable with stored shift windows. */
export function localTimeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for a `<input type="datetime-local">` from a stored ISO timestamp. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${localDayKey(d)}T${localTimeKey(d)}`;
}

/**
 * Instant a `dueAt` should be judged against. A bare `yyyy-mm-dd` means
 * "somewhere on that local day", so it is read as the end of the local day
 * instead of UTC midnight (05:30 IST), which flagged every same-day task as
 * overdue before lunch. Full timestamps keep their own instant.
 */
export function dueAtMs(dueAt: string): number {
  if (DATE_ONLY_RE.test(dueAt)) {
    const [y, m, day] = dueAt.split("-").map(Number);
    return new Date(y, m - 1, day, 23, 59, 59, 999).getTime();
  }
  return new Date(dueAt).getTime();
}

/** Whole minutes elapsed since a stored ISO timestamp, clamped at 0. */
export function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
}
