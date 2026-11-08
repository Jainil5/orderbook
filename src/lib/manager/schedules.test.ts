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
  it("true inside the window", () => expect(isOnShift(shift, new Date("2026-11-08T12:00:00.000Z"))).toBe(true));
  it("false at end boundary", () => expect(isOnShift(shift, new Date("2026-11-08T17:00:00.000Z"))).toBe(false));
  it("false on another day", () => expect(isOnShift(shift, new Date("2026-11-09T12:00:00.000Z"))).toBe(false));
});

describe("weekDays", () => {
  it("returns Monday-first week containing the anchor", () => {
    expect(weekDays(new Date("2026-11-08T12:00:00.000Z"))).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
  });
  it("handles Monday anchor", () => {
    expect(weekDays(new Date("2026-11-02T00:00:00.000Z"))[0]).toBe("2026-11-02");
  });
});