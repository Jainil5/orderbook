import { isoDay, isoInstant } from "./dates";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  AttendanceRecord,
  AttendanceStatus,
  LeaveRequest,
} from "@/types/business";

/**
 * Seeded attendance and leave per demo brand (Staff Manager → Attendance &
 * leave). Owned by the Staff Manager feature area: a deterministic two-week
 * history per employee, plus the leave requests that drive approvals.
 * Approved leave inside the history is written into the attendance rows too,
 * so the two fixtures never disagree.
 */

type Pack = { attendance: AttendanceRecord[]; leave: LeaveRequest[] };

const HISTORY_DAYS = 12;

/** Check-in/out times per status; days away have no clocking. */
const HOURS: Record<AttendanceStatus, [string | null, string | null]> = {
  present: ["09:00", "18:00"],
  late: ["09:45", "18:00"],
  half_day: ["09:00", "13:00"],
  absent: [null, null],
  leave: [null, null],
};

/**
 * Deterministic pattern: walking a week advances the residue by 3 (coprime with
 * 11), so every employee lands on roughly one late, one half day and one absent
 * per twelve days and the rest are present.
 */
function statusFor(staffIndex: number, dayIndex: number): AttendanceStatus {
  const key = (staffIndex * 5 + dayIndex * 3) % 11;
  if (key === 0) return "late";
  if (key === 6) return "half_day";
  if (key === 9) return "absent";
  return "present";
}

function buildAttendance(
  brandId: string,
  prefix: string,
  staffIds: string[],
  leave: LeaveRequest[],
): AttendanceRecord[] {
  const rows: AttendanceRecord[] = [];
  staffIds.forEach((staffId, staffIndex) => {
    for (let index = 0; index < HISTORY_DAYS; index += 1) {
      const offset = index - (HISTORY_DAYS - 1);
      const date = isoDay(offset);
      const approved = leave.find(
        (l) =>
          l.staffId === staffId &&
          l.status === "approved" &&
          date >= l.startsOn &&
          date <= l.endsOn,
      );
      const status: AttendanceStatus = approved ? "leave" : statusFor(staffIndex, index);
      const [checkIn, checkOut] = HOURS[status];
      rows.push({
        id: `${prefix}-att-${staffIndex + 1}-${index + 1}`,
        brand_id: brandId,
        staffId,
        date,
        status,
        checkIn,
        checkOut,
        note: approved ? approved.reason : "",
      });
    }
  });
  return rows;
}

const CAFE_LEAVE: LeaveRequest[] = [
  {
    id: "bc-leave-1",
    brand_id: "demo-brewery-cafe",
    staffId: "bc-staff-1",
    startsOn: isoDay(3),
    endsOn: isoDay(5),
    kind: "casual",
    status: "pending",
    reason: "Family function out of town",
    createdAt: isoInstant(-3),
  },
  {
    id: "bc-leave-2",
    brand_id: "demo-brewery-cafe",
    staffId: "bc-staff-2",
    startsOn: isoDay(-6),
    endsOn: isoDay(-5),
    kind: "sick",
    status: "approved",
    reason: "Fever and rest",
    createdAt: isoInstant(-8),
  },
  {
    id: "bc-leave-3",
    brand_id: "demo-brewery-cafe",
    staffId: "bc-staff-3",
    startsOn: isoDay(8),
    endsOn: isoDay(12),
    kind: "earned",
    status: "pending",
    reason: "Holiday with sister",
    createdAt: isoInstant(-1),
  },
  {
    id: "bc-leave-4",
    brand_id: "demo-brewery-cafe",
    staffId: "bc-staff-4",
    startsOn: isoDay(-9),
    endsOn: isoDay(-9),
    kind: "unpaid",
    status: "rejected",
    reason: "Personal trip during peak week",
    createdAt: isoInstant(-12),
  },
];

const FURNITURE_LEAVE: LeaveRequest[] = [
  {
    id: "cf-leave-1",
    brand_id: "demo-cubig-furniture",
    staffId: "cf-staff-2",
    startsOn: isoDay(2),
    endsOn: isoDay(3),
    kind: "casual",
    status: "pending",
    reason: "College reunion",
    createdAt: isoInstant(-2),
  },
  {
    id: "cf-leave-2",
    brand_id: "demo-cubig-furniture",
    staffId: "cf-staff-1",
    startsOn: isoDay(-3),
    endsOn: isoDay(-1),
    kind: "earned",
    status: "approved",
    reason: "Short family trip",
    createdAt: isoInstant(-7),
  },
  {
    id: "cf-leave-3",
    brand_id: "demo-cubig-furniture",
    staffId: "cf-staff-3",
    startsOn: isoDay(-8),
    endsOn: isoDay(-7),
    kind: "sick",
    status: "approved",
    reason: "Back pain, doctor advised rest",
    createdAt: isoInstant(-9),
  },
  {
    id: "cf-leave-4",
    brand_id: "demo-cubig-furniture",
    staffId: "cf-staff-4",
    startsOn: isoDay(6),
    endsOn: isoDay(7),
    kind: "earned",
    status: "pending",
    reason: "Wedding in hometown",
    createdAt: isoInstant(-1),
  },
];

const CAFE: Pack = {
  attendance: buildAttendance(
    "demo-brewery-cafe",
    "bc",
    ["bc-staff-1", "bc-staff-2", "bc-staff-3", "bc-staff-4"],
    CAFE_LEAVE,
  ),
  leave: CAFE_LEAVE,
};

const FURNITURE: Pack = {
  attendance: buildAttendance(
    "demo-cubig-furniture",
    "cf",
    ["cf-staff-1", "cf-staff-2", "cf-staff-3", "cf-staff-4"],
    FURNITURE_LEAVE,
  ),
  leave: FURNITURE_LEAVE,
};

const PACKS: Record<DemoBrandCode, Pack> = {
  "BR-1": CAFE,
  "BR-2": FURNITURE,
};

export function demoAttendance(brandCode: DemoBrandCode): AttendanceRecord[] {
  return PACKS[brandCode]?.attendance ?? [];
}

export function demoLeave(brandCode: DemoBrandCode): LeaveRequest[] {
  return PACKS[brandCode]?.leave ?? [];
}
