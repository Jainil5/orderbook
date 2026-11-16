import { describe, expect, it } from "vitest";
import {
  agendaTitle,
  buildAgenda,
  buildCalendarEntries,
  daysForView,
  detectConflicts,
  formatDayLabel,
  shiftAnchor,
  type CalendarInput,
} from "./calendar";
import type { Appointment, FieldVisit, Shift, Task } from "@/types/operations";
import type { ExternalEvent } from "@/types/integrations";

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "a1",
  brand_id: "b",
  title: "Coffee tasting",
  customerId: "c1",
  staffIds: ["st1"],
  startsAt: "2026-11-16T10:00:00.000Z",
  endsAt: "2026-11-16T11:00:00.000Z",
  location: "Cafe counter",
  serviceId: null,
  status: "scheduled",
  notes: "",
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  brand_id: "b",
  title: "Restock oat milk",
  description: "",
  assigneeStaffId: "st1",
  customerId: null,
  priority: "medium",
  dueAt: "2026-11-16T09:00:00.000Z",
  status: "open",
  ...overrides,
});

const visit = (overrides: Partial<FieldVisit> = {}): FieldVisit => ({
  id: "v1",
  brand_id: "b",
  customerId: "c1",
  staffId: "st1",
  purpose: "Site measurement",
  status: "checked_in",
  checkInAt: "2026-11-16T12:00:00.000Z",
  checkOutAt: "2026-11-16T13:00:00.000Z",
  report: null,
  ...overrides,
});

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: "s1",
  brand_id: "b",
  staffId: "st1",
  date: "2026-11-16",
  start: "08:00",
  end: "18:00",
  note: "Floor",
  ...overrides,
});

const externalEvent = (overrides: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id: "e1",
  brand_id: "b",
  source: "gmail",
  externalId: "x1",
  kind: "email",
  title: "Re: Table for six",
  startsAt: "2026-11-16T10:30:00.000Z",
  endsAt: "2026-11-16T10:45:00.000Z",
  location: null,
  accountLabel: "hello@brewery.demo",
  customerId: null,
  attendeeCount: null,
  snippet: null,
  needsFollowUp: true,
  syncedAt: "2026-11-15T00:00:00.000Z",
  ...overrides,
});

const input = (overrides: Partial<CalendarInput> = {}): CalendarInput => ({
  appointments: [],
  tasks: [],
  visits: [],
  shifts: [],
  externalEvents: [],
  ...overrides,
});

const staffNames = { st1: "Asha", st2: "Meera" };

describe("buildCalendarEntries", () => {
  it("merges every source into one timeline in start order", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [appointment()],
        tasks: [task()],
        visits: [visit()],
        shifts: [shift()],
        externalEvents: [externalEvent()],
      }),
    );
    expect(entries.map((e) => e.id)).toEqual([
      "shift:s1",
      "task:t1",
      "appointment:a1",
      "external:e1",
      "visit:v1",
    ]);
  });

  it("turns a shift's date and clock times into an interval", () => {
    const [entry] = buildCalendarEntries(input({ shifts: [shift()] }));
    expect(entry?.startsAt).toBe("2026-11-16T08:00:00.000Z");
    expect(entry?.endsAt).toBe("2026-11-16T18:00:00.000Z");
    expect(entry?.title).toBe("Floor");
    expect(entry?.staffIds).toEqual(["st1"]);
  });

  it("drops rows that cannot be placed on a day", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [appointment({ status: "cancelled" })],
        tasks: [task({ dueAt: null })],
        visits: [visit({ status: "planned", checkInAt: null, checkOutAt: null })],
      }),
    );
    expect(entries).toEqual([]);
  });
});

describe("detectConflicts", () => {
  it("flags two bookings that overlap for the same staff member", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment(),
          appointment({
            id: "a2",
            title: "Showroom walkthrough",
            startsAt: "2026-11-16T10:30:00.000Z",
            endsAt: "2026-11-16T11:30:00.000Z",
          }),
        ],
        shifts: [shift()],
      }),
    );
    const conflicts = detectConflicts(entries, staffNames);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toBe("overlap");
    expect(conflicts[0]?.entryIds).toEqual(["appointment:a1", "appointment:a2"]);
    expect(conflicts[0]?.message).toContain("Coffee tasting");
    expect(conflicts[0]?.message).toContain("Asha");
  });

  it("leaves overlapping bookings of different staff alone", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment(),
          appointment({ id: "a2", staffIds: ["st2"], startsAt: "2026-11-16T10:30:00.000Z" }),
        ],
        shifts: [shift(), shift({ id: "s2", staffId: "st2" })],
      }),
    );
    expect(detectConflicts(entries, staffNames)).toEqual([]);
  });

  it("does not treat back-to-back bookings or task due times as clashes", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment(),
          appointment({
            id: "a2",
            startsAt: "2026-11-16T11:00:00.000Z",
            endsAt: "2026-11-16T12:00:00.000Z",
          }),
        ],
        tasks: [task({ dueAt: "2026-11-16T10:30:00.000Z" })],
        externalEvents: [externalEvent({ startsAt: "2026-11-16T10:00:00.000Z" })],
        shifts: [shift()],
      }),
    );
    expect(detectConflicts(entries, staffNames)).toEqual([]);
  });

  it("flags a booking that runs past the staff member's shift", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment({
            startsAt: "2026-11-16T17:00:00.000Z",
            endsAt: "2026-11-16T18:30:00.000Z",
          }),
        ],
        shifts: [shift()],
      }),
    );
    const conflicts = detectConflicts(entries, staffNames);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toBe("outside_shift");
    expect(conflicts[0]?.message).toBe("Coffee tasting falls outside Asha's shift.");
  });

  it("flags a booking on a day the staff member is not scheduled", () => {
    const entries = buildCalendarEntries(
      input({ appointments: [appointment()], shifts: [shift({ date: "2026-11-17" })] }),
    );
    const conflicts = detectConflicts(entries, staffNames);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.message).toContain("has no shift that day");
  });

  it("keeps a booking that fits inside the shift clean", () => {
    const entries = buildCalendarEntries(
      input({ appointments: [appointment()], shifts: [shift()] }),
    );
    expect(detectConflicts(entries, staffNames)).toEqual([]);
  });

  it("ignores finished bookings", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment({ status: "completed" }),
          appointment({
            id: "a2",
            startsAt: "2026-11-16T10:30:00.000Z",
            endsAt: "2026-11-16T11:30:00.000Z",
          }),
        ],
        shifts: [shift()],
      }),
    );
    expect(detectConflicts(entries, staffNames)).toEqual([]);
  });
});

describe("agenda views", () => {
  it("buckets the month Monday-first and covers every day", () => {
    const days = daysForView("month", "2026-01-15");
    expect(days[0]).toBe("2025-12-29");
    expect(days).toHaveLength(35);
    expect(days).toContain("2026-01-01");
    expect(days).toContain("2026-01-31");
    expect(days[days.length - 1]).toBe("2026-02-01");
  });

  it("weeks run Monday to Sunday around the anchor", () => {
    expect(daysForView("week", "2026-11-18")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  it("puts each entry in its own day cell, in order", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment(),
          appointment({
            id: "a2",
            startsAt: "2026-11-17T09:00:00.000Z",
            endsAt: "2026-11-17T10:00:00.000Z",
          }),
        ],
        tasks: [task()],
      }),
    );
    const agenda = buildAgenda(entries, { view: "week", anchor: "2026-11-16", staffNames });
    expect(agenda.days[0]?.entries.map((e) => e.id)).toEqual(["task:t1", "appointment:a1"]);
    expect(agenda.days[1]?.entries.map((e) => e.id)).toEqual(["appointment:a2"]);
    expect(agenda.title).toBe("16 – 22 Nov 2026");
  });

  it("steps the anchor by the size of the view", () => {
    expect(shiftAnchor("day", "2026-11-16", 1)).toBe("2026-11-17");
    expect(shiftAnchor("week", "2026-11-16", -1)).toBe("2026-11-09");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2026-03-15", -1)).toBe("2026-02-15");
  });

  it("labels days, weeks and months", () => {
    expect(formatDayLabel("2026-11-16")).toBe("Mon 16 Nov 2026");
    expect(agendaTitle("day", ["2026-11-16"], "2026-11-16")).toBe("Mon 16 Nov 2026");
    expect(agendaTitle("month", daysForView("month", "2026-11-05"), "2026-11-05")).toBe(
      "November 2026",
    );
    expect(
      agendaTitle("week", daysForView("week", "2026-10-30"), "2026-10-30"),
    ).toBe("26 Oct – 1 Nov 2026");
  });

  it("carries conflicts across every view", () => {
    const entries = buildCalendarEntries(
      input({
        appointments: [
          appointment(),
          appointment({
            id: "a2",
            startsAt: "2026-11-16T10:30:00.000Z",
            endsAt: "2026-11-16T11:30:00.000Z",
          }),
        ],
        shifts: [shift()],
      }),
    );
    const dayView = buildAgenda(entries, { view: "day", anchor: "2026-11-16", staffNames });
    const monthView = buildAgenda(entries, { view: "month", anchor: "2026-11-16", staffNames });
    expect(dayView.conflicts).toHaveLength(1);
    expect(monthView.conflicts).toHaveLength(1);
    expect(monthView.days.flatMap((d) => d.entries)).toHaveLength(3);
  });
});
