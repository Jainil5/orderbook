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
import { DEMO_LIMITS } from "@/lib/demo/read-only";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { newOpsId } from "@/lib/manager/ops-shared";
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

/**
 * Store a browser-created ops row at the head of its collection. When the
 * collection cap is hit, the oldest browser-created row is recycled — seeded
 * rows are never dropped.
 */
async function insertOps<T extends { id: string }>(
  code: DemoBrandCode,
  key: OpsListKey,
  row: T,
): Promise<void> {
  const cap = DEMO_LIMITS[key];
  await updateDemoMutableBucket(code, (bucket) => {
    const rows = (bucket[key] ?? []) as unknown as T[];
    const next = [row, ...rows];
    let droppedId: string | null = null;
    while (next.length > cap) {
      droppedId = next.pop()!.id;
    }
    if (droppedId) {
      const overrideKey = `${key.replace(/s$/, "")}Overrides` as OpsOverrideKey;
      const overrides = { ...((bucket[overrideKey] ?? {}) as Record<string, unknown>) };
      delete overrides[droppedId];
      return { ...bucket, [key]: next, [overrideKey]: overrides } as DemoMutableBucket;
    }
    return { ...bucket, [key]: next } as DemoMutableBucket;
  });
}

function revalidateOps(modulePath: string) {
  revalidatePath("/manager");
  revalidatePath(modulePath);
  revalidatePath("/customers", "layout");
}

export async function saveAppointmentAction(id: string | null, input: AppointmentInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateAppointmentInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) {
    const pack = getDemoBrandPack(guard.code);
    await insertOps(guard.code, "appointments", {
      id: newOpsId("demo-appt"),
      brand_id: pack.brand.id,
      status: "scheduled",
      ...parsed.value,
    });
  } else {
    await patchOps(guard.code, "appointmentOverrides", id, parsed.value);
  }
  revalidateOps("/manager/meetings");
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
  revalidateOps("/manager/meetings");
  return { ok: true as const };
}

export async function deleteAppointmentAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "appointments", id)))
    return { ok: false as const, message: "Appointment not found." };
  await patchOps(guard.code, "appointmentOverrides", id, { deleted: true });
  revalidateOps("/manager/meetings");
  return { ok: true as const };
}

export async function saveTaskAction(id: string | null, input: TaskInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateTaskInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) {
    const pack = getDemoBrandPack(guard.code);
    await insertOps(guard.code, "tasks", {
      id: newOpsId("demo-task"),
      brand_id: pack.brand.id,
      status: "open",
      ...parsed.value,
    });
  } else {
    await patchOps(guard.code, "taskOverrides", id, parsed.value);
  }
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
  if (!id) {
    const pack = getDemoBrandPack(guard.code);
    await insertOps(guard.code, "shifts", {
      id: newOpsId("demo-shift"),
      brand_id: pack.brand.id,
      ...parsed.value,
    });
  } else {
    await patchOps(guard.code, "shiftOverrides", id, parsed.value);
  }
  revalidateOps("/manager/staff");
  return { ok: true as const };
}

export async function deleteShiftAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "shifts", id)))
    return { ok: false as const, message: "Shift not found." };
  await patchOps(guard.code, "shiftOverrides", id, { deleted: true });
  revalidateOps("/manager/staff");
  return { ok: true as const };
}

export async function saveVisitAction(id: string | null, input: VisitInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateVisitInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) {
    const pack = getDemoBrandPack(guard.code);
    await insertOps(guard.code, "visits", {
      id: newOpsId("demo-visit"),
      brand_id: pack.brand.id,
      status: "planned",
      checkInAt: null,
      checkOutAt: null,
      report: null,
      ...parsed.value,
    });
  } else {
    await patchOps(guard.code, "visitOverrides", id, parsed.value);
  }
  revalidateOps("/manager/meetings");
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
  revalidateOps("/manager/meetings");
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
  revalidateOps("/manager/meetings");
  return { ok: true as const };
}

export async function deleteVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!(await hasOpsRecord(guard.code, "visits", id)))
    return { ok: false as const, message: "Visit not found." };
  await patchOps(guard.code, "visitOverrides", id, { deleted: true });
  revalidateOps("/manager/meetings");
  return { ok: true as const };
}

export async function saveLeadAction(id: string | null, input: LeadInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateLeadInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (!id) {
    const pack = getDemoBrandPack(guard.code);
    await insertOps(guard.code, "leads", {
      id: newOpsId("demo-lead"),
      brand_id: pack.brand.id,
      quotation_number: null,
      ...parsed.value,
      created_at: new Date().toISOString(),
    });
  } else {
    await patchOps(guard.code, "leadOverrides", id, parsed.value);
  }
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
