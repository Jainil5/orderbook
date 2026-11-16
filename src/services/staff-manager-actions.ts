"use server";

import {
  auditBusinessOps,
  guardBusinessOps,
  revalidateBusiness,
} from "@/lib/business/actions-kit";
import { attendanceCollection, leaveCollection } from "@/lib/business/registry";
import {
  day,
  fail,
  knownRefs,
  oneOf,
  refId,
  text,
  type Validated,
} from "@/lib/business/validate";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { overlappingLeaves } from "@/lib/manager/workforce";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import {
  ATTENDANCE_STATUSES,
  LEAVE_KINDS,
  type AttendanceRecord,
  type AttendanceStatus,
  type LeaveRequest,
} from "@/types/business";

/**
 * Server actions for Staff Manager attendance and leave. They run through the
 * shared business guard, validators and audit trail, and revalidate the Staff
 * Manager overview plus the attendance screen.
 */

const STAFF_MANAGER_PATH = "/manager/staff";
const ATTENDANCE_PATH = "/manager/staff/attendance";

export type AttendanceInput = {
  staffId: string;
  date: string;
  status: string;
};

export type LeaveInput = {
  staffId: string;
  startsOn: string;
  endsOn: string;
  kind: string;
  reason: string;
};

/** `refId` allows an empty value; attendance and leave always need a person. */
function requiredStaff(result: Validated<string | null>): Validated<string> {
  if (!result.ok) return result;
  if (!result.value) return fail("Staff member is required.");
  return { ok: true, value: result.value };
}

async function validateAttendance(input: AttendanceInput, code: DemoBrandCode) {
  const refs = await knownRefs(code);
  const staff = requiredStaff(refId(input.staffId, refs.staffIds, "Staff member"));
  if (!staff.ok) return staff;
  const date = day(input.date, "Date");
  if (!date.ok) return date;
  const status = oneOf(input.status, ATTENDANCE_STATUSES, "Attendance status");
  if (!status.ok) return status;
  return {
    ok: true as const,
    value: { staffId: staff.value, date: date.value, status: status.value },
  };
}

/**
 * New clocked days borrow their check-in and check-out from the rota, so a
 * marked day lines up with the shift that was scheduled for it. Days away have
 * no clocking.
 */
async function clockFromRota(
  code: DemoBrandCode,
  staffId: string,
  date: string,
  status: AttendanceStatus,
): Promise<{ checkIn: string | null; checkOut: string | null }> {
  if (status === "absent" || status === "leave") {
    return { checkIn: null, checkOut: null };
  }
  const ops = await loadDemoOperations(code);
  const shift = ops.shifts.find((s) => s.staffId === staffId && s.date === date);
  return { checkIn: shift?.start ?? null, checkOut: shift?.end ?? null };
}

export async function saveAttendanceAction(id: string | null, input: AttendanceInput) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const parsed = await validateAttendance(input, guard.code);
  if (!parsed.ok) return parsed;

  // A page can be stale (two tabs, or a week view left open), so an existing
  // row for the same person and day is patched rather than duplicated.
  const records = await attendanceCollection.load(guard.code);
  const existing = id
    ? records.find((r) => r.id === id)
    : records.find((r) => r.staffId === parsed.value.staffId && r.date === parsed.value.date);
  if (id && !existing) return { ok: false as const, message: "Attendance record not found." };

  const target = existing ?? null;
  if (target) {
    await attendanceCollection.patch(guard.code, target.id, {
      staffId: parsed.value.staffId,
      date: parsed.value.date,
      status: parsed.value.status,
    });
    await auditBusinessOps(
      guard,
      "attendance.updated",
      "attendance",
      target.id,
      `${target.staffId} ${target.date} ${parsed.value.status}`,
    );
    revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
    return { ok: true as const };
  }

  const clock = await clockFromRota(
    guard.code,
    parsed.value.staffId,
    parsed.value.date,
    parsed.value.status,
  );
  const record: AttendanceRecord = {
    id: attendanceCollection.nextId(),
    brand_id: guard.brandId,
    staffId: parsed.value.staffId,
    date: parsed.value.date,
    status: parsed.value.status,
    ...clock,
    note: "",
  };
  await attendanceCollection.append(guard.code, record);
  await auditBusinessOps(
    guard,
    "attendance.created",
    "attendance",
    record.id,
    `${record.staffId} ${record.date} ${record.status}`,
  );
  revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
  return { ok: true as const };
}

export async function deleteAttendanceAction(id: string) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const record = (await attendanceCollection.load(guard.code)).find((r) => r.id === id);
  if (!record) return { ok: false as const, message: "Attendance record not found." };
  await attendanceCollection.remove(guard.code, id);
  await auditBusinessOps(
    guard,
    "attendance.deleted",
    "attendance",
    id,
    `${record.staffId} ${record.date}`,
  );
  revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
  return { ok: true as const };
}

async function validateLeave(input: LeaveInput, code: DemoBrandCode) {
  const refs = await knownRefs(code);
  const staff = requiredStaff(refId(input.staffId, refs.staffIds, "Staff member"));
  if (!staff.ok) return staff;
  const startsOn = day(input.startsOn, "First day");
  if (!startsOn.ok) return startsOn;
  const endsOn = day(input.endsOn, "Last day");
  if (!endsOn.ok) return endsOn;
  if (endsOn.value < startsOn.value) {
    return { ok: false as const, message: "The last day must be on or after the first day." };
  }
  const kind = oneOf(input.kind, LEAVE_KINDS, "Leave type");
  if (!kind.ok) return kind;
  const reason = text(input.reason, "Reason", 200, false);
  if (!reason.ok) return reason;
  return {
    ok: true as const,
    value: {
      staffId: staff.value,
      startsOn: startsOn.value,
      endsOn: endsOn.value,
      kind: kind.value,
      reason: reason.value,
    },
  };
}

export async function requestLeaveAction(input: LeaveInput) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const parsed = await validateLeave(input, guard.code);
  if (!parsed.ok) return parsed;

  const requests = await leaveCollection.load(guard.code);
  const clash = overlappingLeaves(
    requests,
    parsed.value.staffId,
    parsed.value.startsOn,
    parsed.value.endsOn,
  )[0];
  if (clash) {
    return {
      ok: false as const,
      message: `This person already has a ${clash.status} request covering ${clash.startsOn} to ${clash.endsOn}.`,
    };
  }

  const leave: LeaveRequest = {
    id: leaveCollection.nextId(),
    brand_id: guard.brandId,
    ...parsed.value,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await leaveCollection.append(guard.code, leave);
  await auditBusinessOps(
    guard,
    "leave.requested",
    "leave",
    leave.id,
    `${leave.staffId} ${leave.startsOn}..${leave.endsOn} ${leave.kind}`,
  );
  revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
  return { ok: true as const };
}

type PendingLeave =
  | { ok: false; message: string }
  | { ok: true; leave: LeaveRequest; requests: LeaveRequest[] };

/** A request that can still be decided, with the rest of the brand's requests for overlap checks. */
async function loadPending(id: string, code: DemoBrandCode): Promise<PendingLeave> {
  const requests = await leaveCollection.load(code);
  const leave = requests.find((l) => l.id === id);
  if (!leave) return { ok: false, message: "Leave request not found." };
  if (leave.status !== "pending") {
    return { ok: false, message: "Only pending requests can be decided." };
  }
  return { ok: true, leave, requests };
}

export async function approveLeaveAction(id: string) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const found = await loadPending(id, guard.code);
  if (!found.ok) return found;

  const clash = overlappingLeaves(
    found.requests.filter((l) => l.id !== id),
    found.leave.staffId,
    found.leave.startsOn,
    found.leave.endsOn,
  )[0];
  if (clash) {
    return {
      ok: false as const,
      message: `Overlaps another ${clash.status} request for this person (${clash.startsOn} to ${clash.endsOn}). Decide that one first.`,
    };
  }

  await leaveCollection.patch(guard.code, id, { status: "approved" });
  await auditBusinessOps(
    guard,
    "leave.approved",
    "leave",
    id,
    `${found.leave.staffId} ${found.leave.startsOn}..${found.leave.endsOn}`,
  );
  revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
  return { ok: true as const };
}

export async function rejectLeaveAction(id: string) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const found = await loadPending(id, guard.code);
  if (!found.ok) return found;

  await leaveCollection.patch(guard.code, id, { status: "rejected" });
  await auditBusinessOps(
    guard,
    "leave.rejected",
    "leave",
    id,
    `${found.leave.staffId} ${found.leave.startsOn}..${found.leave.endsOn}`,
  );
  revalidateBusiness(STAFF_MANAGER_PATH, ATTENDANCE_PATH);
  return { ok: true as const };
}
