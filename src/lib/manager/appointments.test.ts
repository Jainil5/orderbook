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
