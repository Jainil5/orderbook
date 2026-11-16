import type {
  AttendanceRecord,
  AttendanceStatus,
  LeaveKind,
  LeaveRequest,
  LeaveStatus,
} from "@/types/business";
import type { StaffMember } from "@/types/manager";
import type { Shift } from "@/types/operations";

/**
 * Attendance, leave and availability maths shared by the Staff Manager screens
 * and server actions. Everything here is pure and works on `YYYY-MM-DD`
 * calendar-day strings, so range checks stay simple string comparisons.
 */

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half day",
  absent: "Absent",
  leave: "On leave",
};

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  casual: "Casual",
  sick: "Sick",
  earned: "Earned",
  unpaid: "Unpaid",
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Days that mean the person is away and should not be booked. */
export function isAwayDay(status: AttendanceStatus): boolean {
  return status === "absent" || status === "leave";
}

function dayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Calendar day `offset` days away from `day` (negative goes back in time). */
export function shiftDay(day: string, offset: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return dayString(d);
}

/** `count` days ending on `endDay`, oldest first. */
export function recentDays(endDay: string, count: number): string[] {
  const size = Math.max(0, count);
  return Array.from({ length: size }, (_, i) => shiftDay(endDay, i - size + 1));
}

/** The Monday-anchored week that contains `day`, oldest first. */
export function weekDaysOf(day: string): string[] {
  const d = new Date(`${day}T12:00:00`);
  const monday = shiftDay(day, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

/** Today as the demo data records it: the UTC calendar day. */
export function todayDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AttendanceSummary = {
  /** Recorded days in scope. */
  days: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  leave: number;
  /** Present and late count as a whole day, half days as half. */
  attended: number;
  /** Days that could have been worked: recorded days minus approved leave. */
  expected: number;
  /** `attended / expected` as a percentage, 0 when nothing was expected. */
  rate: number;
};

const EMPTY_SUMMARY: AttendanceSummary = {
  days: 0,
  present: 0,
  late: 0,
  halfDay: 0,
  absent: 0,
  leave: 0,
  attended: 0,
  expected: 0,
  rate: 0,
};

/** Counts and attendance rate for a set of records, optionally scoped to one person and day range. */
export function summarizeAttendance(
  records: AttendanceRecord[],
  opts?: { staffId?: string; from?: string; to?: string },
): AttendanceSummary {
  const scoped = filterAttendance(records, opts);
  if (!scoped.length) return EMPTY_SUMMARY;

  const count = (status: AttendanceStatus) =>
    scoped.filter((r) => r.status === status).length;
  const present = count("present");
  const late = count("late");
  const halfDay = count("half_day");
  const absent = count("absent");
  const leave = count("leave");
  const attended = present + late + halfDay * 0.5;
  const expected = scoped.length - leave;

  return {
    days: scoped.length,
    present,
    late,
    halfDay,
    absent,
    leave,
    attended,
    expected,
    rate: expected > 0 ? (attended / expected) * 100 : 0,
  };
}

function filterAttendance(
  records: AttendanceRecord[],
  opts?: { staffId?: string; from?: string; to?: string },
): AttendanceRecord[] {
  return records.filter(
    (r) =>
      (!opts?.staffId || r.staffId === opts.staffId) &&
      (!opts?.from || r.date >= opts.from) &&
      (!opts?.to || r.date <= opts.to),
  );
}

export function attendanceOn(
  records: AttendanceRecord[],
  staffId: string,
  day: string,
): AttendanceRecord | undefined {
  return records.find((r) => r.staffId === staffId && r.date === day);
}

/** Whole days covered by a leave request, inclusive. 0 when the range is invalid. */
export function leaveDayCount(startsOn: string, endsOn: string): number {
  const start = new Date(`${startsOn}T12:00:00`).getTime();
  const end = new Date(`${endsOn}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Inclusive overlap between two `YYYY-MM-DD` ranges. Touching edges overlap. */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function leaveCoversDate(leave: LeaveRequest, day: string): boolean {
  return leave.startsOn <= day && day <= leave.endsOn;
}

/** Requests for one person that overlap a range, in the given statuses. */
export function overlappingLeaves(
  requests: LeaveRequest[],
  staffId: string,
  startsOn: string,
  endsOn: string,
  statuses: readonly LeaveStatus[] = ["pending", "approved"],
): LeaveRequest[] {
  return requests.filter(
    (l) =>
      l.staffId === staffId &&
      statuses.includes(l.status) &&
      rangesOverlap(startsOn, endsOn, l.startsOn, l.endsOn),
  );
}

export function pendingLeaves(requests: LeaveRequest[]): LeaveRequest[] {
  return requests
    .filter((l) => l.status === "pending")
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

export type UnavailabilityReason = "leave" | "attendance";

export type StaffUnavailability = {
  member: StaffMember;
  reason: UnavailabilityReason;
  /** Short text for the warning line, e.g. the leave kind. */
  detail: string;
};

/**
 * Active staff who should not be booked on `day`: approved leave or an
 * attendance record that says they are away. Pending requests do not block.
 */
export function unavailableStaffOn(
  day: string,
  staff: StaffMember[],
  leaves: LeaveRequest[],
  attendance: AttendanceRecord[],
): StaffUnavailability[] {
  const rows: StaffUnavailability[] = [];
  for (const member of staff) {
    if (member.status !== "active") continue;
    const leave = leaves.find(
      (l) => l.staffId === member.id && l.status === "approved" && leaveCoversDate(l, day),
    );
    if (leave) {
      rows.push({
        member,
        reason: "leave",
        detail: LEAVE_KIND_LABELS[leave.kind],
      });
      continue;
    }
    const record = attendanceOn(attendance, member.id, day);
    if (record && isAwayDay(record.status)) {
      rows.push({
        member,
        reason: "attendance",
        detail: ATTENDANCE_STATUS_LABELS[record.status],
      });
    }
  }
  return rows;
}

/** Hours rostered for one person inside a day range, to one decimal. */
export function shiftHoursForRange(
  shifts: Shift[],
  staffId: string,
  from: string,
  to: string,
): number {
  const minutes = shifts
    .filter((s) => s.staffId === staffId && s.date >= from && s.date <= to)
    .reduce((total, s) => {
      const [sh, sm] = s.start.split(":").map(Number);
      const [eh, em] = s.end.split(":").map(Number);
      if (![sh, sm, eh, em].every(Number.isFinite)) return total;
      return total + Math.max(0, eh * 60 + em - (sh * 60 + sm));
    }, 0);
  return Math.round((minutes / 60) * 10) / 10;
}
