// The manager UI is ₹/IST-first, so "today" and time-of-day must come from the
// user's zone, not UTC. Pin the zone so the suite fails identically everywhere.
process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import { isOnShift, validateShiftInput, weekDays } from "./schedules";
import type { Shift } from "@/types/operations";

describe("validateShiftInput", () => {
  const valid = { staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };
  it("accepts a valid shift", () => {
    expect(validateShiftInput(valid, ["st1"]).ok).toBe(true);
  });
  it("rejects unknown staff, bad date, bad time, end before start", () => {
    expect(validateShiftInput({ ...valid, staffId: "no" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, date: "2026-13-40" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, start: "25:00" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, end: "08:00" }, ["st1"]).ok).toBe(false);
  });
});

describe("isOnShift", () => {
  const shift: Shift = { id: "s", brand_id: "b", staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };
  it("true inside the window", () => expect(isOnShift(shift, new Date("2026-11-08T12:00:00+05:30"))).toBe(true));
  it("false at end boundary", () => expect(isOnShift(shift, new Date("2026-11-08T17:00:00+05:30"))).toBe(false));
  it("false on another day", () => expect(isOnShift(shift, new Date("2026-11-09T12:00:00+05:30"))).toBe(false));

  it("true for an evening shift whose UTC hour sits outside the window", () => {
    // 20:00 IST on 8 Nov is 14:30 UTC — a UTC-derived clock reads 14:30 and
    // would report the 18:00–22:00 shift as finished.
    const evening: Shift = { ...shift, start: "18:00", end: "22:00" };
    expect(isOnShift(evening, new Date("2026-11-08T20:00:00+05:30"))).toBe(true);
  });
  it("true for an early-hours shift before 05:30 IST", () => {
    // 00:30 IST on 9 Nov is 19:00 UTC on 8 Nov — a UTC-derived day key misses it.
    const late: Shift = { ...shift, date: "2026-11-09", start: "00:00", end: "02:00" };
    expect(isOnShift(late, new Date("2026-11-09T00:30:00+05:30"))).toBe(true);
  });
  it("false when the local day differs even though the UTC day matches", () => {
    // 00:30 IST on 9 Nov is still 8 Nov in UTC.
    expect(isOnShift({ ...shift, start: "00:00", end: "02:00" }, new Date("2026-11-09T00:30:00+05:30"))).toBe(false);
  });
});

describe("weekDays", () => {
  it("returns Monday-first week containing the anchor", () => {
    expect(weekDays(new Date("2026-11-08T12:00:00+05:30"))).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
  });
  it("handles Monday anchor", () => {
    expect(weekDays(new Date("2026-11-02T00:00:00+05:30"))[0]).toBe("2026-11-02");
  });
  it("anchors on the local day just after midnight", () => {
    // 00:30 IST on Mon 2 Nov is Sat 1 Nov in UTC; the grid must still start at 2 Nov.
    expect(weekDays(new Date("2026-11-02T00:30:00+05:30"))).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
  });
  it("stays on the local week just before midnight", () => {
    // 23:30 IST on Sun 8 Nov is Mon 9 Nov in UTC.
    expect(weekDays(new Date("2026-11-08T23:30:00+05:30"))[0]).toBe("2026-11-02");
  });
});
