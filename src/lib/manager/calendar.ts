import { weekDays } from "@/lib/manager/schedules";
import type { Appointment, FieldVisit, Shift, Task } from "@/types/operations";
import type { ExternalEvent } from "@/types/integrations";

/**
 * Unified agenda for the Productivity calendar.
 *
 * Appointments, field visits, shifts, tasks with a due time and synced
 * external calendar/email rows normalise into one `CalendarEntry` list, which
 * both the conflict detection and the day/week/month views work from.
 *
 * Day keys are the `YYYY-MM-DD` UTC prefix of an ISO instant — the same
 * convention `Shift.date`, `weekDays()` and `appointmentsForDay()` already use.
 */

export type CalendarEntryKind =
  | "appointment"
  | "task"
  | "visit"
  | "shift"
  | "external";

export const CALENDAR_KIND_LABELS: Record<CalendarEntryKind, string> = {
  appointment: "Appointment",
  task: "Task",
  visit: "Field visit",
  shift: "Shift",
  external: "External",
};

export type CalendarEntry = {
  /** `kind:recordId` — stable across views and reloads. */
  id: string;
  kind: CalendarEntryKind;
  refId: string;
  title: string;
  startsAt: string;
  /** Null for point entries (a task due time). Those cannot overlap. */
  endsAt: string | null;
  staffIds: string[];
  location: string | null;
  status: string | null;
  /** Source detail worth showing: external account label. */
  detail: string | null;
};

export type CalendarInput = {
  appointments: Appointment[];
  tasks: Task[];
  visits: FieldVisit[];
  shifts: Shift[];
  externalEvents: ExternalEvent[];
};

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarDay = { date: string; entries: CalendarEntry[] };

export type CalendarConflict = {
  /** Agenda entry ids involved: two for a double booking, one for a shift miss. */
  entryIds: string[];
  reason: "overlap" | "outside_shift";
  staffId: string | null;
  startsAt: string;
  message: string;
};

export type CalendarAgendaModel = {
  view: CalendarView;
  title: string;
  days: CalendarDay[];
  conflicts: CalendarConflict[];
};

function clockInstant(day: string, time: string): string | null {
  const parsed = new Date(`${day}T${time}:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildCalendarEntries(input: CalendarInput): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const appointment of input.appointments) {
    // A cancelled booking is history, not something to resolve on the agenda.
    if (appointment.status === "cancelled") continue;
    entries.push({
      id: `appointment:${appointment.id}`,
      kind: "appointment",
      refId: appointment.id,
      title: appointment.title,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      staffIds: appointment.staffIds,
      location: appointment.location || null,
      status: appointment.status,
      detail: null,
    });
  }

  for (const task of input.tasks) {
    if (!task.dueAt) continue;
    entries.push({
      id: `task:${task.id}`,
      kind: "task",
      refId: task.id,
      title: task.title,
      startsAt: task.dueAt,
      endsAt: null,
      staffIds: task.assigneeStaffId ? [task.assigneeStaffId] : [],
      location: null,
      status: task.status,
      detail: null,
    });
  }

  for (const visit of input.visits) {
    // Planned visits carry no scheduled time yet, so only check-ins and
    // completed visits can be placed on a day.
    if (!visit.checkInAt) continue;
    entries.push({
      id: `visit:${visit.id}`,
      kind: "visit",
      refId: visit.id,
      title: visit.purpose,
      startsAt: visit.checkInAt,
      endsAt: visit.checkOutAt,
      staffIds: [visit.staffId],
      location: null,
      status: visit.status,
      detail: null,
    });
  }

  for (const shift of input.shifts) {
    const startsAt = clockInstant(shift.date, shift.start);
    const endsAt = clockInstant(shift.date, shift.end);
    if (!startsAt || !endsAt) continue;
    entries.push({
      id: `shift:${shift.id}`,
      kind: "shift",
      refId: shift.id,
      title: shift.note.trim() || "Shift",
      startsAt,
      endsAt,
      staffIds: [shift.staffId],
      location: null,
      status: null,
      detail: null,
    });
  }

  for (const event of input.externalEvents) {
    entries.push({
      id: `external:${event.id}`,
      kind: "external",
      refId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      staffIds: [],
      location: event.location,
      status: event.kind,
      detail: event.accountLabel,
    });
  }

  return entries.sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
}

/** Shifts and task due times hold no slot, so only these can clash. */
const BOOKING_KINDS: CalendarEntryKind[] = ["appointment", "visit", "external"];

function isBookedSlot(
  entry: CalendarEntry,
): entry is CalendarEntry & { endsAt: string } {
  return (
    BOOKING_KINDS.includes(entry.kind) &&
    entry.endsAt !== null &&
    entry.status !== "completed"
  );
}

function staffLabel(ids: string[], staffNames: Record<string, string>): string {
  return ids.map((id) => staffNames[id] ?? "the assignee").join(", ");
}

/**
 * Two conflicts matter on one agenda: the same person booked twice, and a
 * booking that lands outside (or in place of) the person's shift.
 */
export function detectConflicts(
  entries: CalendarEntry[],
  staffNames: Record<string, string>,
): CalendarConflict[] {
  const shifts = entries.filter(
    (e): e is CalendarEntry & { endsAt: string } =>
      e.kind === "shift" && e.endsAt !== null,
  );
  const bookings = entries.filter(isBookedSlot);
  const conflicts: CalendarConflict[] = [];

  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];
      const shared = a.staffIds.filter((id) => b.staffIds.includes(id));
      if (shared.length === 0) continue;
      if (a.startsAt >= b.endsAt || b.startsAt >= a.endsAt) continue;
      conflicts.push({
        entryIds: [a.id, b.id],
        reason: "overlap",
        staffId: shared[0],
        startsAt: a.startsAt,
        message: `${a.title} and ${b.title} overlap for ${staffLabel(shared, staffNames)}.`,
      });
    }
  }

  for (const booking of bookings) {
    for (const staffId of booking.staffIds) {
      const dayShifts = shifts.filter(
        (s) =>
          s.staffIds.includes(staffId) &&
          dayKey(s.startsAt) === dayKey(booking.startsAt),
      );
      if (
        dayShifts.some(
          (s) => s.startsAt <= booking.startsAt && booking.endsAt <= s.endsAt,
        )
      ) {
        continue;
      }
      const name = staffNames[staffId] ?? "the assignee";
      conflicts.push({
        entryIds: [booking.id],
        reason: "outside_shift",
        staffId,
        startsAt: booking.startsAt,
        message: dayShifts.length
          ? `${booking.title} falls outside ${name}'s shift.`
          : `${booking.title} is booked while ${name} has no shift that day.`,
      });
    }
  }

  return conflicts.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function dayKey(instant: string): string {
  return instant.slice(0, 10);
}

export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayParts(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year, month, date];
}

function addDayKey(day: string, days: number): string {
  return new Date(
    Date.parse(`${day}T00:00:00Z`) + days * 86_400_000,
  ).toISOString();
}

/** Monday-first grid covering the anchor's month, including edge days. */
function monthGrid(anchor: string): string[] {
  const [year, month] = dayParts(anchor);
  const firstOfMonth = `${year}-${pad(month)}-01`;
  const leading =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lastDate + leading) / 7) * 7;
  const start = addDayKey(firstOfMonth, -leading).slice(0, 10);
  return Array.from({ length: cells }, (_, i) =>
    addDayKey(start, i).slice(0, 10),
  );
}

export function daysForView(view: CalendarView, anchor: string): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return weekDays(new Date(`${anchor}T00:00:00Z`));
  return monthGrid(anchor);
}

/** Move the agenda window by whole days, weeks or months. */
export function shiftAnchor(
  view: CalendarView,
  anchor: string,
  delta: number,
): string {
  if (view !== "month") return addDayKey(anchor, delta * (view === "week" ? 7 : 1)).slice(0, 10);
  const [year, month, date] = dayParts(anchor);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const lastDate = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(date, lastDate))}`;
}

export const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDayLabel(day: string): string {
  const [year, month, date] = dayParts(day);
  const weekday =
    CALENDAR_WEEKDAYS[(new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7];
  return `${weekday} ${date} ${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`;
}

export function agendaTitle(
  view: CalendarView,
  days: string[],
  anchor: string,
): string {
  if (days.length === 0) return formatDayLabel(anchor);
  if (view === "day") return formatDayLabel(days[0]);
  if (view === "month") {
    const [year, month] = dayParts(anchor);
    return `${MONTH_LABELS[month - 1]} ${year}`;
  }
  const start = dayParts(days[0]);
  const end = dayParts(days[days.length - 1]);
  const shortMonth = (month: number) => MONTH_LABELS[month - 1].slice(0, 3);
  if (start[0] === end[0] && start[1] === end[1]) {
    return `${start[2]} – ${end[2]} ${shortMonth(start[1])} ${start[0]}`;
  }
  if (start[0] === end[0]) {
    return `${start[2]} ${shortMonth(start[1])} – ${end[2]} ${shortMonth(end[1])} ${start[0]}`;
  }
  return `${start[2]} ${shortMonth(start[1])} ${start[0]} – ${end[2]} ${shortMonth(end[1])} ${end[0]}`;
}

export function buildAgenda(
  entries: CalendarEntry[],
  params: { view: CalendarView; anchor: string; staffNames: Record<string, string> },
): CalendarAgendaModel {
  const days = daysForView(params.view, params.anchor);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.startsAt);
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }
  return {
    view: params.view,
    title: agendaTitle(params.view, days, params.anchor),
    days: days.map((date) => ({ date, entries: byDay.get(date) ?? [] })),
    conflicts: detectConflicts(entries, params.staffNames),
  };
}
