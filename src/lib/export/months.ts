/**
 * Calendar-month helpers for the Export data feature.
 *
 * Pure on purpose: no `src/lib/demo` loaders, no `next/headers`, no cookies, so
 * the bucketing is unit-testable and reusable by any caller.
 *
 * Timestamps bucket by the reader's own local calendar month — the same rule
 * `localDayKey` uses (see `src/lib/manager/time.ts`). A UTC slice would put
 * anything before 05:30 IST in the previous month, and at a month boundary it
 * would move a bill into the month before the one the merchant sees on screen.
 */

import { localDayKey } from "@/lib/manager/time";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Buckets the month picker renders: how many rows and how much money. */
export type MonthBucket = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

const DEFAULT_MONTH_LIMIT = 24;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `YYYY-MM` shape only — what a month selection is validated against. */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

/**
 * Local calendar month (`YYYY-MM`) of an ISO timestamp, a `YYYY-MM-DD` day key,
 * a `Date`, or an already-valid month key. `null` for empty/invalid input, so
 * callers can skip undated rows instead of inventing a bucket for them.
 */
export function monthKey(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    if (isMonthKey(raw)) return raw;
    if (DAY_KEY_RE.test(raw)) {
      const key = raw.slice(0, 7);
      return isMonthKey(key) ? key : null;
    }
    return monthKey(new Date(raw));
  }
  if (Number.isNaN(value.getTime())) return null;
  return localDayKey(value).slice(0, 7);
}

/** `"2026-11"` -> `"Nov 2026"`. Month names are pinned, not locale-derived. */
export function monthLabel(key: string): string {
  if (!isMonthKey(key)) return key;
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * Group rows into month buckets, newest first. Undated rows are skipped;
 * `amountOf` decides what each row contributes (default 0), and `limit` caps
 * how many months come back (default the last 24).
 */
export function summarizeMonths<T>(
  rows: readonly T[],
  opts: {
    dateOf: (row: T) => string | Date | null | undefined;
    amountOf?: (row: T) => number;
    limit?: number;
  },
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();
  for (const row of rows) {
    const key = monthKey(opts.dateOf(row));
    if (!key) continue;
    const bucket =
      buckets.get(key) ?? { key, label: monthLabel(key), count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += opts.amountOf ? opts.amountOf(row) : 0;
    buckets.set(key, bucket);
  }
  const newestFirst = Array.from(buckets.values()).sort((a, b) =>
    a.key === b.key ? 0 : a.key < b.key ? 1 : -1,
  );
  const limit = Math.max(0, opts.limit ?? DEFAULT_MONTH_LIMIT);
  return newestFirst.slice(0, limit).map((bucket) => ({
    ...bucket,
    amount: round2(bucket.amount),
  }));
}

/**
 * The rows whose month is in `months`. An empty selection exports nothing —
 * the picker has to tick at least one month, and undated rows never match.
 */
export function filterByMonths<T>(
  rows: readonly T[],
  dateOf: (row: T) => string | Date | null | undefined,
  months: readonly string[],
): T[] {
  const picked = new Set(months.filter(isMonthKey));
  if (picked.size === 0) return [];
  return rows.filter((row) => {
    const key = monthKey(dateOf(row));
    return key !== null && picked.has(key);
  });
}

/**
 * The date an order belongs to: the service day chosen at billing when there is
 * one, otherwise the moment the bill was created. Blank `service_date` values
 * come out of the demo CSVs as `""`, so they are treated as absent.
 */
export function orderDateValue(o: {
  service_date?: string | null;
  created_at: string;
}): string {
  const serviceDate = o.service_date?.trim();
  return serviceDate ? serviceDate : o.created_at;
}
