// Appointments are bucketed by the manager's local day (₹/IST demo), so the
// 00:00–05:30 IST window must not fall into the previous UTC day.
process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import { appointmentsForDay, groupAppointments, validateAppointmentInput } from "./appointments";
import type { Appointment } from "@/types/operations";

const known = { customerIds: ["c1"], staffIds: ["st1"], serviceIds: ["s1"] };
const valid = { title: "Tasting", customerId: "c1", staffIds: ["st1"], startsAt: "2026-11-08T10:00", endsAt: "2026-11-08T11:00", location: "Cafe", serviceId: "", notes: "" };

describe("validateAppointmentInput", () => {
  it("normalizes times to ISO and empty refs to null", () => {
    const r = validateAppointmentInput(valid, known);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.serviceId).toBeNull();
      expect(new Date(r.value.startsAt).toISOString()).toBe(r.value.startsAt);
    }
  });
  it("rejects end before start", () => {
    expect(validateAppointmentInput({ ...valid, endsAt: "2026-11-08T09:00" }, known).ok).toBe(false);
  });
  it("rejects empty title and unknown refs", () => {
    expect(validateAppointmentInput({ ...valid, title: " " }, known).ok).toBe(false);
    expect(validateAppointmentInput({ ...valid, customerId: "no" }, known).ok).toBe(false);
    expect(validateAppointmentInput({ ...valid, staffIds: ["no"] }, known).ok).toBe(false);
  });
});

function apt(id: string, startsAt: string): Appointment {
  return { id, brand_id: "b", title: id, customerId: null, staffIds: [], startsAt, endsAt: startsAt, location: "", serviceId: null, status: "scheduled", notes: "" };
}

describe("day helpers", () => {
  const list = [apt("p", "2026-11-07T10:00:00.000Z"), apt("t2", "2026-11-08T15:00:00.000Z"), apt("t1", "2026-11-08T09:00:00.000Z"), apt("u", "2026-11-09T10:00:00.000Z")];
  it("appointmentsForDay filters and sorts by start", () => {
    expect(appointmentsForDay(list, "2026-11-08").map((a) => a.id)).toEqual(["t1", "t2"]);
  });
  it("groupAppointments splits past/today/upcoming", () => {
    const g = groupAppointments(list, new Date("2026-11-08T12:00:00.000Z"));
    expect(g.past.map((a) => a.id)).toEqual(["p"]);
    expect(g.today.map((a) => a.id)).toEqual(["t1", "t2"]);
    expect(g.upcoming.map((a) => a.id)).toEqual(["u"]);
  });
});

describe("day helpers on the IST clock", () => {
  // Stored timestamps are always UTC ISO (the validators normalize them):
  // 01:00 IST on 8 Nov is 2026-11-07T19:30:00.000Z.
  const earlyMorning = apt("night", "2026-11-07T19:30:00.000Z");
  it("appointmentsForDay buckets pre-05:30 bookings into the local day", () => {
    expect(appointmentsForDay([earlyMorning], "2026-11-08").map((a) => a.id)).toEqual(["night"]);
    expect(appointmentsForDay([earlyMorning], "2026-11-07")).toEqual([]);
  });
  it("groupAppointments treats pre-05:30 bookings as today", () => {
    const g = groupAppointments([earlyMorning], new Date("2026-11-08T12:00:00+05:30"));
    expect(g.today.map((a) => a.id)).toEqual(["night"]);
    expect(g.past).toEqual([]);
  });
  it("keeps late-evening bookings out of the next local day", () => {
    // 23:30 IST on 8 Nov is 2026-11-08T18:00:00.000Z; with `now` at 00:30 IST
    // on 9 Nov (19:00 UTC on 8 Nov) it must read as yesterday, not today.
    const g = groupAppointments([apt("late", "2026-11-08T18:00:00.000Z")], new Date("2026-11-09T00:30:00+05:30"));
    expect(g.today).toEqual([]);
    expect(g.past.map((a) => a.id)).toEqual(["late"]);
  });
});
