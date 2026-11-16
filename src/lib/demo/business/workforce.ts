import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { AttendanceRecord, LeaveRequest } from "@/types/business";

/**
 * Seeded attendance and leave per demo brand (Staff Manager → Attendance &
 * leave). Owned by the Staff Manager feature area — replace these starter rows
 * with a realistic two-week history rather than adding another data source.
 */

type Pack = { attendance: AttendanceRecord[]; leave: LeaveRequest[] };

const CAFE: Pack = { attendance: [], leave: [] };
const FURNITURE: Pack = { attendance: [], leave: [] };

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
