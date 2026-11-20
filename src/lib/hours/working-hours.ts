/**
 * Working hours — the pure half of the "Open now" story.
 *
 * One schedule per brand, read by the workspace settings screen, the public
 * brand site and anything else that has to say whether the counter is open.
 * Nothing in here touches cookies, the demo packs or Next: it takes a
 * `WorkingHours` value and a `Date` and answers in the *reader's own* local
 * time, the same rule `src/lib/manager/time.ts` applies to shifts — a
 * 07:00 opening is 07:00 where the visitor is, not 07:00 IST in UTC slices.
 *
 * Storage lives elsewhere on purpose: the shipped schedule is a JSON text
 * column in `brand_settings.csv`, a browser's edit is the `workingHours` entry
 * in the `ob_workspace_prefs` cookie, and both are merged outside this file.
 */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Calendar order the product shows everywhere: Monday first, Sunday last. */
export const WEEKDAY_ORDER: readonly WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/** One opening window in `"HH:MM"` 24-hour local time; `null` = closed that day. */
export type DayWindow = { open: string; close: string } | null;

export type WorkingHours = Record<WeekdayKey, DayWindow>;

export type OpenStatus = "open" | "closing_soon" | "closed";

export type OpenState = {
  status: OpenStatus;
  /** Sentence for a page: "Open until 16:00" / "Closed · opens 7:00 Fri". */
  label: string;
  /** Pill text: "Open now" / "Closing soon" / "Closed". */
  pill: string;
  /** Instant the current (or next) window opens; `null` when nothing opens. */
  opensAt: Date | null;
  /** Instant the current window closes; `null` unless the doors are open. */
  closesAt: Date | null;
};

/**
 * Seed schedule — the hours Brewery Cafe has always printed on its own
 * website, so a brand that never edits anything still says the same thing it
 * used to hardcode.
 */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { open: "07:00", close: "16:00" },
  tue: { open: "07:00", close: "16:00" },
  wed: { open: "07:00", close: "16:00" },
  thu: { open: "07:00", close: "16:00" },
  fri: { open: "07:00", close: "17:00" },
  sat: { open: "08:00", close: "17:00" },
  sun: { open: "08:00", close: "17:00" },
};

const FULL_DAY: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const SHORT_DAY: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** En-dash range, matching the copy the brand sites already ship. */
const DASH = "–";
const MIDDLE = "·";

const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Accept `7:00` as well as `07:00`, store the padded form so sorting works. */
function normalizeClock(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = CLOCK_RE.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

function minutesOf(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "07:00" reads as "7:00" in a sentence, exactly like the printed hours. */
function spokenClock(clock: string): string {
  const [hours, minutes] = clock.split(":");
  return `${Number(hours)}:${minutes}`;
}

function weekdayOf(d: Date): WeekdayKey {
  return WEEKDAY_ORDER[(d.getDay() + 6) % 7];
}

/** `clock` on the local calendar day of `from`. */
function atLocalClock(from: Date, clock: string): Date {
  const [hours, minutes] = clock.split(":").map(Number);
  return new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours, minutes, 0, 0);
}

type DayResult =
  | { ok: true; window: { open: string; close: string } }
  | { ok: false; message: string };

function readDayWindow(day: WeekdayKey, raw: unknown): DayResult {
  const unusable: DayResult = {
    ok: false,
    message: `${FULL_DAY[day]} must be a pair of times, or empty for closed.`,
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return unusable;
  const candidate = raw as { open?: unknown; close?: unknown };
  const open = normalizeClock(candidate.open);
  const close = normalizeClock(candidate.close);
  if (open === null || close === null) {
    return {
      ok: false,
      message: `${FULL_DAY[day]} needs 24-hour times like 07:00 and 16:00.`,
    };
  }
  if (minutesOf(close) <= minutesOf(open)) {
    return {
      ok: false,
      message: `${FULL_DAY[day]} closes at ${spokenClock(close)}, which is not after it opens at ${spokenClock(open)}.`,
    };
  }
  return { ok: true, window: { open, close } };
}

/**
 * Read untrusted input — CSV JSON text, a cookie blob, a server-action
 * payload — into a full seven-day schedule. `null` says "unusable": a missing
 * day, a malformed time or a window that closes before it opens.
 */
export function parseWorkingHours(raw: unknown): WorkingHours | null {
  const result = validateWorkingHours(raw);
  return result.ok ? result.value : null;
}

/** Same read as `parseWorkingHours`, but keeping the reason a UI can show. */
export function validateWorkingHours(
  raw: unknown,
): { ok: true; value: WorkingHours } | { ok: false; message: string } {
  let source = raw;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return { ok: false, message: "Enter opening hours for every day." };
    try {
      source = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, message: "Those opening hours are not readable." };
    }
  }
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return { ok: false, message: "Enter opening hours for every day." };
  }
  const record = source as Record<string, unknown>;
  const hours: Partial<WorkingHours> = {};
  for (const day of WEEKDAY_ORDER) {
    if (!(day in record)) {
      return { ok: false, message: `${FULL_DAY[day]} is missing from the opening hours.` };
    }
    const value = record[day];
    if (value === null) {
      hours[day] = null;
      continue;
    }
    const parsed = readDayWindow(day, value);
    if (!parsed.ok) return parsed;
    hours[day] = parsed.window;
  }
  return { ok: true, value: hours as WorkingHours };
}

/** Column-safe JSON text: keys in calendar order so two packs diff cleanly. */
export function workingHoursToJson(hours: WorkingHours): string {
  const ordered: Array<[WeekdayKey, DayWindow]> = WEEKDAY_ORDER.map((day) => {
    const window = hours[day];
    return [day, window ? { open: window.open, close: window.close } : null];
  });
  return JSON.stringify(Object.fromEntries(ordered));
}

/**
 * The next window that opens strictly after `now`, searching a whole week plus
 * one day so a brand that is only open Mondays still gets next Monday.
 */
export function nextOpenWindow(
  hours: WorkingHours,
  now: Date,
): { day: WeekdayKey; open: string; date: Date } | null {
  const floor = now.getTime();
  const todayMinutes = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 7; offset++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const day = weekdayOf(dayStart);
    const window = hours[day];
    if (!window) continue;
    if (offset === 0 && minutesOf(window.open) <= todayMinutes) continue;
    const date = atLocalClock(dayStart, window.open);
    if (date.getTime() <= floor) continue;
    return { day, open: window.open, date };
  }
  return null;
}

/**
 * Open / closing soon / closed, as one sentence and one pill.
 *
 * `paused` is the manual switch, not an empty schedule: a business that is
 * technically inside its hours but has stopped taking orders says "Not taking
 * orders right now" and gives the UI no instant to count down to.
 */
export function openStateAt(
  hours: WorkingHours,
  now: Date,
  opts?: { paused?: boolean; closingSoonMinutes?: number },
): OpenState {
  if (opts?.paused === true) {
    return {
      status: "closed",
      pill: "Closed",
      label: "Not taking orders right now",
      opensAt: null,
      closesAt: null,
    };
  }

  const closingSoonMinutes = opts?.closingSoonMinutes ?? 60;
  const window = hours[weekdayOf(now)];
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (window) {
    const open = minutesOf(window.open);
    const close = minutesOf(window.close);
    if (minutesNow >= open && minutesNow < close) {
      const opensAt = atLocalClock(now, window.open);
      const closesAt = atLocalClock(now, window.close);
      if (close - minutesNow <= closingSoonMinutes) {
        return {
          status: "closing_soon",
          pill: "Closing soon",
          label: `Closing soon ${MIDDLE} until ${spokenClock(window.close)}`,
          opensAt,
          closesAt,
        };
      }
      return {
        status: "open",
        pill: "Open now",
        label: `Open until ${spokenClock(window.close)}`,
        opensAt,
        closesAt,
      };
    }
  }

  const next = nextOpenWindow(hours, now);
  return {
    status: "closed",
    pill: "Closed",
    label: next
      ? `Closed ${MIDDLE} opens ${spokenClock(next.open)} ${SHORT_DAY[next.day]}`
      : "Closed",
    opensAt: next ? next.date : null,
    closesAt: null,
  };
}

function sameWindow(a: DayWindow, b: DayWindow): boolean {
  if (a === null || b === null) return a === b;
  return a.open === b.open && a.close === b.close;
}

/**
 * Printed hours from a schedule, shaped like the copy the brand sites already
 * use: `{ days: "Mon–Thu", time: "7:00 – 16:00" }`, consecutive days that
 * share a window on one line, a closed day reading "Closed".
 */
export function hoursRows(hours: WorkingHours): { days: string; time: string }[] {
  const rows: { days: string; time: string }[] = [];
  let index = 0;
  while (index < WEEKDAY_ORDER.length) {
    const day = WEEKDAY_ORDER[index];
    const window = hours[day];
    let last = index;
    while (
      last + 1 < WEEKDAY_ORDER.length &&
      sameWindow(hours[WEEKDAY_ORDER[last + 1]], window)
    ) {
      last++;
    }
    const days =
      last === index
        ? FULL_DAY[day]
        : `${SHORT_DAY[day]}${DASH}${SHORT_DAY[WEEKDAY_ORDER[last]]}`;
    const time = window
      ? `${spokenClock(window.open)} ${DASH} ${spokenClock(window.close)}`
      : "Closed";
    rows.push({ days, time });
    index = last + 1;
  }
  return rows;
}
