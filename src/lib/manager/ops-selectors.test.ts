// The overview counts today's work on the manager's local day (₹/IST demo).
process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import { customerOperationsTimeline, overviewRollups } from "./ops-selectors";
import type { Appointment, FieldVisit, ServiceJob, Shift, Task } from "@/types/operations";

const now = new Date("2026-11-08T12:00:00+05:30");
const apt: Appointment = { id: "a1", brand_id: "b", title: "Tasting", customerId: "c1", staffIds: [], startsAt: "2026-11-08T15:00:00.000Z", endsAt: "2026-11-08T16:00:00.000Z", location: "", serviceId: null, status: "scheduled", notes: "" };
const visit: FieldVisit = { id: "v1", brand_id: "b", customerId: "c1", staffId: "st1", purpose: "Survey", status: "checked_in", checkInAt: "2026-11-08T10:00:00.000Z", checkOutAt: null, report: null };
const job: ServiceJob = { id: "j1", brand_id: "b", serviceId: "s1", customerId: "c1", staffIds: ["st1"], status: "requested", scheduledAt: null, notes: "" };
const task: Task = { id: "t1", brand_id: "b", title: "Follow up", description: "", assigneeStaffId: null, customerId: "c1", priority: "high", dueAt: "2026-11-07T12:00:00.000Z", status: "open" };
const shift: Shift = { id: "s1", brand_id: "b", staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };

describe("customerOperationsTimeline", () => {
  it("collects the customer's records with deep links, newest first, undated last", () => {
    const rows = customerOperationsTimeline("c1", { appointments: [apt], visits: [visit], jobs: [job], tasks: [task] }, { s1: "Catering" });
    expect(rows.map((r) => r.kind)).toEqual(["appointment", "visit", "task", "job"]);
    expect(rows[0].href).toBe("/manager/appointments");
    expect(rows[3].title).toBe("Catering");
  });
  it("excludes other customers and done tasks", () => {
    const rows = customerOperationsTimeline("c2", { appointments: [apt], visits: [visit], jobs: [job], tasks: [task] }, {});
    expect(rows).toEqual([]);
    const rows2 = customerOperationsTimeline("c1", { appointments: [], visits: [], jobs: [], tasks: [{ ...task, status: "done" }] }, {});
    expect(rows2).toEqual([]);
  });
});

describe("overviewRollups", () => {
  it("counts today's scheduled appointments, overdue tasks, on-shift, active visits, open jobs", () => {
    const r = overviewRollups({ appointments: [apt, { ...apt, id: "a2", status: "cancelled" }], tasks: [task, { ...task, id: "t2", status: "done" }], shifts: [shift], visits: [visit], jobs: [job, { ...job, id: "j2", status: "completed" }] }, now);
    expect(r).toEqual({ todayAppointments: 1, overdueTasks: 1, onShiftNow: 1, activeVisits: 1, openJobs: 1 });
  });
  it("counts work that sits in the 00:00–05:30 IST window on the local day", () => {
    // 01:00 IST on 8 Nov is 19:30 UTC on 7 Nov, and the night shift's UTC
    // clock reads 14:30 — both must still roll up into "today".
    const nightShift: Shift = { ...shift, start: "18:00", end: "22:00" };
    const r = overviewRollups(
      {
        appointments: [{ ...apt, startsAt: "2026-11-07T19:30:00.000Z", endsAt: "2026-11-07T20:30:00.000Z" }],
        tasks: [],
        shifts: [nightShift],
        visits: [],
        jobs: [],
      },
      new Date("2026-11-08T20:00:00+05:30"),
    );
    expect(r).toEqual({ todayAppointments: 1, overdueTasks: 0, onShiftNow: 1, activeVisits: 0, openJobs: 0 });
  });
});
