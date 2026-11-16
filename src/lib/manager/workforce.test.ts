import { describe, expect, it } from "vitest";
import {
  isAwayDay,
  leaveCoversDate,
  leaveDayCount,
  overlappingLeaves,
  rangesOverlap,
  recentDays,
  shiftDay,
  shiftHoursForRange,
  summarizeAttendance,
  unavailableStaffOn,
  weekDaysOf,
} from "@/lib/manager/workforce";
import type { AttendanceRecord, AttendanceStatus, LeaveRequest } from "@/types/business";
import type { StaffMember } from "@/types/manager";
import type { Shift } from "@/types/operations";

const record = (
  staffId: string,
  date: string,
  status: AttendanceStatus,
): AttendanceRecord => ({
  id: `${staffId}-${date}`,
  brand_id: "demo-brewery-cafe",
  staffId,
  date,
  status,
  checkIn: status === "absent" || status === "leave" ? null : "09:00",
  checkOut: status === "absent" || status === "leave" ? null : "17:00",
  note: "",
});

const leave = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: "lv-1",
  brand_id: "demo-brewery-cafe",
  staffId: "s1",
  startsOn: "2026-11-10",
  endsOn: "2026-11-12",
  kind: "casual",
  status: "pending",
  reason: "Family trip",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "s1",
  brand_id: "demo-brewery-cafe",
  name: "Asha",
  role: "manager",
  phone: null,
  email: null,
  status: "active",
  availability: "available",
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

const shift = (over: Partial<Shift> = {}): Shift => ({
  id: "sh-1",
  brand_id: "demo-brewery-cafe",
  staffId: "s1",
  date: "2026-11-10",
  start: "09:00",
  end: "17:30",
  note: "",
  ...over,
});

describe("summarizeAttendance", () => {
  const records = [
    record("s1", "2026-11-02", "present"),
    record("s1", "2026-11-03", "late"),
    record("s1", "2026-11-04", "half_day"),
    record("s1", "2026-11-05", "absent"),
    record("s1", "2026-11-06", "leave"),
    record("s2", "2026-11-02", "present"),
  ];

  it("counts each status and derives the rate", () => {
    const summary = summarizeAttendance(records, { staffId: "s1" });
    expect(summary).toMatchObject({
      days: 5,
      present: 1,
      late: 1,
      halfDay: 1,
      absent: 1,
      leave: 1,
      attended: 2.5,
      expected: 4,
      rate: 62.5,
    });
  });

  it("scopes to a day range inclusively", () => {
    const summary = summarizeAttendance(records, {
      staffId: "s1",
      from: "2026-11-03",
      to: "2026-11-05",
    });
    expect(summary.days).toBe(3);
    expect(summary.attended).toBe(1.5);
    expect(summary.expected).toBe(3);
  });

  it("returns zeros when nothing is recorded", () => {
    expect(summarizeAttendance([], { staffId: "s1" })).toEqual({
      days: 0,
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      leave: 0,
      attended: 0,
      expected: 0,
      rate: 0,
    });
  });

  it("sums the whole brand when no staff filter is given", () => {
    expect(summarizeAttendance(records).days).toBe(6);
  });
});

describe("day helpers", () => {
  it("shifts days across a month boundary", () => {
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("lists recent days ending on the anchor", () => {
    expect(recentDays("2026-11-03", 3)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(recentDays("2026-11-03", 0)).toEqual([]);
  });

  it("anchors the week on Monday", () => {
    expect(weekDaysOf("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(weekDaysOf("2026-11-02")[0]).toBe("2026-11-02");
  });
});

describe("leave range maths", () => {
  it("counts days inclusively", () => {
    expect(leaveDayCount("2026-11-10", "2026-11-10")).toBe(1);
    expect(leaveDayCount("2026-11-10", "2026-11-13")).toBe(4);
    expect(leaveDayCount("2026-11-13", "2026-11-10")).toBe(0);
  });

  it("treats touching ranges as overlapping", () => {
    expect(rangesOverlap("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-15")).toBe(true);
    expect(rangesOverlap("2026-11-10", "2026-11-11", "2026-11-12", "2026-11-15")).toBe(false);
    expect(rangesOverlap("2026-11-01", "2026-11-30", "2026-11-10", "2026-11-12")).toBe(true);
  });

  it("matches a leave request that covers a date", () => {
    expect(leaveCoversDate(leave(), "2026-11-12")).toBe(true);
    expect(leaveCoversDate(leave(), "2026-11-13")).toBe(false);
  });

  it("finds overlapping requests for the same person, honouring statuses", () => {
    const requests = [
      leave({ id: "a", status: "pending" }),
      leave({ id: "b", status: "approved", startsOn: "2026-11-20", endsOn: "2026-11-22" }),
      leave({ id: "c", status: "rejected" }),
      leave({ id: "d", staffId: "s2" }),
    ];
    expect(
      overlappingLeaves(requests, "s1", "2026-11-11", "2026-11-14").map((l) => l.id),
    ).toEqual(["a"]);
    expect(
      overlappingLeaves(requests, "s1", "2026-11-21", "2026-11-21", ["approved"]).map(
        (l) => l.id,
      ),
    ).toEqual(["b"]);
    expect(overlappingLeaves(requests, "s2", "2026-11-10", "2026-11-12")).toHaveLength(1);
  });
});

describe("unavailableStaffOn", () => {
  const staff = [member(), member({ id: "s2", name: "Rohan" }), member({ id: "s3", name: "Meera" })];

  it("lists approved leave and absences but not pending requests", () => {
    const rows = unavailableStaffOn(
      "2026-11-11",
      staff,
      [leave({ staffId: "s1", status: "approved" }), leave({ id: "lv-2", staffId: "s2" })],
      [record("s3", "2026-11-11", "absent")],
    );
    expect(rows).toEqual([
      { member: staff[0], reason: "leave", detail: "Casual" },
      { member: staff[2], reason: "attendance", detail: "Absent" },
    ]);
  });

  it("skips inactive staff and approved leave wins over an attendance record", () => {
    const rows = unavailableStaffOn(
      "2026-11-11",
      [member({ status: "inactive" }), member({ id: "s9" })],
      [leave({ staffId: "s9", status: "approved" })],
      [record("s9", "2026-11-11", "present")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("leave");
  });

  it("is empty when everyone is simply not marked yet", () => {
    expect(unavailableStaffOn("2026-12-01", staff, [], [])).toEqual([]);
  });
});

describe("shiftHoursForRange", () => {
  it("adds rostered hours inside the range only", () => {
    expect(
      shiftHoursForRange(
        [shift(), shift({ id: "sh-2", start: "10:00", end: "12:00" }), shift({ id: "sh-3", date: "2026-11-20" }), shift({ id: "sh-4", staffId: "s2" })],
        "s1",
        "2026-11-01",
        "2026-11-15",
      ),
    ).toBe(10.5);
  });
});

describe("isAwayDay", () => {
  it("flags the statuses that block booking", () => {
    expect(isAwayDay("absent")).toBe(true);
    expect(isAwayDay("leave")).toBe(true);
    expect(isAwayDay("present")).toBe(false);
    expect(isAwayDay("late")).toBe(false);
    expect(isAwayDay("half_day")).toBe(false);
  });
});
