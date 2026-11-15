"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import {
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOperations } from "@/lib/demo/operations-data";
import { readOnlyMessage } from "@/lib/demo/read-only";
import { listDemoStaff } from "@/lib/demo/staff-data";
import {
  validateAppointmentInput,
  type AppointmentInput,
} from "@/lib/manager/appointments";
import {
  validateLeadInput,
  type LeadInput,
} from "@/lib/manager/leads";
import { validateShiftInput, type ShiftInput } from "@/lib/manager/schedules";
import {
  jobAdvanceError,
  nextJobStatus,
  validateServiceInput,
  validateServiceJobInput,
  type ServiceInput,
  type ServiceJobInput,
} from "@/lib/manager/services";
import {
  validateTaskInput,
  type TaskInput,
} from "@/lib/manager/tasks";
import {
  validateVisitInput,
  visitTransitionError,
  type VisitInput,
} from "@/lib/manager/visits";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { LEAD_STAGES, type LeadStage, type TaskStatus } from "@/types/operations";

type OpsGuard =
  | { ok: true; code: DemoBrandCode }
  | { ok: false; message: string };

async function guardOps(): Promise<OpsGuard> {
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ?? "BR-1";
  return { ok: true, code };
}

async function knownIds(code: DemoBrandCode) {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const ops = mergeOperations(pack, bucket);
  const staff = await listDemoStaff(code);
  return {
    customerIds: mergeDemoCustomers(pack.customers, bucket).map((c) => c.id),
    staffIds: staff.map((s) => s.id),
    serviceIds: ops.services.map((s) => s.id),
  };
}

type OpsListKey =
  | "services"
  | "serviceJobs"
  | "appointments"
  | "tasks"
  | "shifts"
  | "visits"
  | "leads";
type OpsOverrideKey =
  | "serviceOverrides"
  | "serviceJobOverrides"
  | "appointmentOverrides"
  | "taskOverrides"
  | "shiftOverrides"
  | "visitOverrides"
  | "leadOverrides";

async function loadMergedOps(code: DemoBrandCode) {
  return mergeOperations(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

/**
 * Existence guard for the tombstone/override writers. Without it a stale row in
 * one tab wrote `{ deleted: true }` (or an override) for an id that no longer
 * resolves and the UI reported a dishonest success.
 */
async function hasOpsRecord(code: DemoBrandCode, list: OpsListKey, id: string) {
  const ops = await loadMergedOps(code);
  return ops[list].some((entity) => entity.id === id);
}

async function patchOps(
  code: DemoBrandCode,
  key: OpsOverrideKey,
  id: string,
  patch: Record<string, unknown>,
) {
  await updateDemoMutableBucket(code, (bucket) => {
    const overrides = (bucket[key] ?? {}) as Record<string, Record<string, unknown>>;
    return {
      ...bucket,
      [key]: { ...overrides, [id]: { ...(overrides[id] ?? {}), ...patch } },
    } as DemoMutableBucket;
  });
}

function revalidateOps(modulePath: string) {
  revalidatePath("/manager");
  revalidatePath(modulePath);
  revalidatePath("/customers", "layout");
}

export async function saveServiceAction(id: string | null, input: ServiceInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceInput(input);
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "serviceOverrides", id, parsed.value);
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "services", id)))
    return { ok: false as const, message: "Service not found." };
  await patchOps(guard.code, "serviceOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function toggleServiceActiveAction(id: string, isActive: boolean) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "services", id)))
    return { ok: false as const, message: "Service not found." };
  await patchOps(guard.code, "serviceOverrides", id, { isActive });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function saveServiceJobAction(id: string | null, input: ServiceJobInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceJobInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "serviceJobOverrides", id, parsed.value);
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function advanceServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const ops = await loadMergedOps(guard.code);
  const job = ops.serviceJobs.find((j) => j.id === id);
  if (!job) return { ok: false as const, message: "Job not found." };
  const error = jobAdvanceError(job);
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "serviceJobOverrides", id, { status: nextJobStatus(job.status) });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "serviceJobs", id)))
    return { ok: false as const, message: "Job not found." };
  await patchOps(guard.code, "serviceJobOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function saveAppointmentAction(id: string | null, input: AppointmentInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateAppointmentInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "appointmentOverrides", id, parsed.value);
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function setAppointmentStatusAction(id: string, status: "completed" | "cancelled") {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const ops = await loadMergedOps(guard.code);
  const appointment = ops.appointments.find((a) => a.id === id);
  if (!appointment) return { ok: false as const, message: "Appointment not found." };
  if (appointment.status !== "scheduled") {
    return { ok: false as const, message: "Only scheduled appointments can change status." };
  }
  await patchOps(guard.code, "appointmentOverrides", id, { status });
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function deleteAppointmentAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "appointments", id)))
    return { ok: false as const, message: "Appointment not found." };
  await patchOps(guard.code, "appointmentOverrides", id, { deleted: true });
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function saveTaskAction(id: string | null, input: TaskInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateTaskInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "taskOverrides", id, parsed.value);
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  if (!["open", "in_progress", "done"].includes(status)) {
    return { ok: false as const, message: "Invalid status." };
  }
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "tasks", id)))
    return { ok: false as const, message: "Task not found." };
  await patchOps(guard.code, "taskOverrides", id, { status });
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function deleteTaskAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "tasks", id)))
    return { ok: false as const, message: "Task not found." };
  await patchOps(guard.code, "taskOverrides", id, { deleted: true });
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function saveShiftAction(id: string | null, input: ShiftInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateShiftInput(input, (await knownIds(guard.code)).staffIds);
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "shiftOverrides", id, parsed.value);
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}

export async function deleteShiftAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "shifts", id)))
    return { ok: false as const, message: "Shift not found." };
  await patchOps(guard.code, "shiftOverrides", id, { deleted: true });
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}

export async function saveVisitAction(id: string | null, input: VisitInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateVisitInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "visitOverrides", id, parsed.value);
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkInVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const ops = await loadMergedOps(guard.code);
  const visit = ops.visits.find((v) => v.id === id);
  if (!visit) return { ok: false as const, message: "Visit not found." };
  const error = visitTransitionError(visit, "check_in");
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "visitOverrides", id, {
    status: "checked_in",
    checkInAt: new Date().toISOString(),
  });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkOutVisitAction(id: string, report: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const ops = await loadMergedOps(guard.code);
  const visit = ops.visits.find((v) => v.id === id);
  if (!visit) return { ok: false as const, message: "Visit not found." };
  const error = visitTransitionError(visit, "check_out", report);
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "visitOverrides", id, {
    status: "completed",
    checkOutAt: new Date().toISOString(),
    report: report.trim().slice(0, 500),
  });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function deleteVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "visits", id)))
    return { ok: false as const, message: "Visit not found." };
  await patchOps(guard.code, "visitOverrides", id, { deleted: true });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function saveLeadAction(id: string | null, input: LeadInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateLeadInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) return readOnlyMessage();
  await patchOps(guard.code, "leadOverrides", id, parsed.value);
  revalidateOps("/manager/leads");
  return { ok: true as const };
}

export async function setLeadStageAction(id: string, stage: LeadStage) {
  if (!LEAD_STAGES.includes(stage)) {
    return { ok: false as const, message: "Invalid stage." };
  }
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "leads", id)))
    return { ok: false as const, message: "Lead not found." };
  await patchOps(guard.code, "leadOverrides", id, { stage });
  revalidateOps("/manager/leads");
  return { ok: true as const };
}

export async function deleteLeadAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "leads", id)))
    return { ok: false as const, message: "Lead not found." };
  await patchOps(guard.code, "leadOverrides", id, { deleted: true });
  revalidateOps("/manager/leads");
  return { ok: true as const };
}
