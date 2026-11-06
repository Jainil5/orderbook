/**
 * Date-range helpers for Analytics and Dashboard.
 *
 * Calendar dates are business-timezone dates, not UTC dates. A retail
 * business in India opens and closes its day in IST; computing "today" as
 * UTC midnight would drop every order placed between 00:00 and 05:30 IST
 * into the previous day. `BUSINESS_TIME_ZONE` is the single place that
 * decision lives.
 */

/** India has no DST, so this resolves to a constant +05:30. */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

/** Lower bound used when a range means "everything". */
export const MIN_CALENDAR_DATE = "1970-01-01";
/** Upper bound used when a range means "everything". */
export const MAX_CALENDAR_DATE = "9999-12-31";

export type RangePreset =
  | "today"
  | "week"
  | "month"
  | "year"
  | "7d"
  | "30d"
  | "90d"
  | "3m"
  | "12m"
  | "all";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

export const DEFAULT_RANGE_PRESET: RangePreset = "30d";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

export function presetLabel(preset: RangePreset): string {
  return RANGE_PRESETS.find((p) => p.id === preset)?.label ?? preset;
}

/** Minutes that the zone is ahead of UTC at the given instant. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const hour = read("hour") % 24;
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second"),
  );
  return Math.round((asIfUtc - instant.getTime()) / 60000);
}

/** UTC millisecond instant for the start of a calendar day, in the zone. */
export function zoneDayStartUtc(
  calendarDate: string,
  timeZone = BUSINESS_TIME_ZONE,
): number {
  if (!isCalendarDate(calendarDate)) {
    throw new Error(`Invalid calendar date: ${calendarDate}`);
  }
  const [year, month, day] = calendarDate.split("-").map(Number);
  // Probes the offset at midday in the zone so a boundary-day offset change
  // (none in Asia/Kolkata, but the helper is generic) cannot flip the answer.
  const naiveUtcNoon = Date.UTC(year, month - 1, day, 12);
  const offset = zoneOffsetMinutes(new Date(naiveUtcNoon), timeZone);
  return Date.UTC(year, month - 1, day) - offset * 60000;
}

/**
 * Instant just after a calendar day in the zone. Computed as start + 24h in
 * absolute time rather than by resolving the next calendar date, so the
 * "all time" sentinel (year 9999) cannot overflow into a 5-digit year.
 * Exact for a fixed-offset zone like Asia/Kolkata; a DST zone would need a
 * per-day offset here.
 */
export function zoneDayEndUtc(
  calendarDate: string,
  timeZone = BUSINESS_TIME_ZONE,
): number {
  return zoneDayStartUtc(calendarDate, timeZone) + 86400000;
}

/** The business-zone calendar date containing an instant. */
export function calendarDateInZone(
  instant: Date,
  timeZone = BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function addCalendarDays(calendarDate: string, days: number): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86400000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** Calendar-month arithmetic with end-of-month clamping (Mar 31 - 1m = Feb 28). */
export function addCalendarMonths(
  calendarDate: string,
  months: number,
): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/** Monday-based, matching Indian business week convention. */
function weekdayIndexMonday(calendarDate: string): number {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

export function rangeFromPreset(
  preset: RangePreset,
  now: Date = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): { from: string; to: string } {
  const today = calendarDateInZone(now, timeZone);
  const yesterdaySafe = (days: number) => addCalendarDays(today, -days);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: yesterdaySafe(weekdayIndexMonday(today)), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "7d":
    case "30d":
    case "90d": {
      const span = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
      return { from: yesterdaySafe(span - 1), to: today };
    }
    case "3m":
      return { from: addCalendarMonths(today, -3), to: today };
    case "12m":
      return { from: addCalendarMonths(today, -12), to: today };
    case "all":
      return { from: MIN_CALENDAR_DATE, to: MAX_CALENDAR_DATE };
  }
}

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === "string" && RANGE_PRESETS.some((p) => p.id === value);
}

export type ResolvedRange = {
  from: string;
  to: string;
  /** Which preset is highlighted. `null` when an explicit from/to is in use. */
  preset: RangePreset | null;
  /** Human-readable caption for the page header. */
  label: string;
};

/**
 * Resolves a page's `?range=` / `?from=` / `?to=` params into a calendar
 * range. Explicit from/to wins over a preset so the custom pickers stay
 * reachable; invalid values fall back to `fallbackPreset` rather than
 * producing an empty report.
 */
export function resolveRange(
  search: { range?: string; from?: string; to?: string },
  fallbackPreset: RangePreset = DEFAULT_RANGE_PRESET,
  now: Date = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): ResolvedRange {
  if (isCalendarDate(search.from) && isCalendarDate(search.to)) {
    const from = search.from <= search.to ? search.from : search.to;
    const to = search.from <= search.to ? search.to : search.from;
    return { from, to, preset: null, label: `${from} to ${to}` };
  }

  const preset = isRangePreset(search.range) ? search.range : fallbackPreset;
  const { from, to } = rangeFromPreset(preset, now, timeZone);
  return { from, to, preset, label: presetLabel(preset) };
}

/** Inclusive calendar `to` day → exclusive upper bound for created_at lt queries. */
export function createdAtRangeQuery(
  from: string,
  to: string,
  timeZone = BUSINESS_TIME_ZONE,
): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: new Date(zoneDayStartUtc(from, timeZone)).toISOString(),
    dateTo: new Date(zoneDayEndUtc(to, timeZone)).toISOString(),
  };
}

export function orderInCalendarRange(
  createdAt: string,
  from: string,
  to: string,
  timeZone = BUSINESS_TIME_ZONE,
): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= zoneDayStartUtc(from, timeZone) && t < zoneDayEndUtc(to, timeZone);
}
