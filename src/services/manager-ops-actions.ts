"use server";

import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import {
  appendDemoAudit,
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import {
  validateAppointmentInput,
  type AppointmentInput,
} from "@/lib/manager/appointments";
import { newOpsId } from "@/lib/manager/ops-shared";
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
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task, TaskStatus } from "@/types/operations";

const LIVE_UNAVAILABLE = {
  ok: false as const,
  message: "Operations are not connected to live workspaces yet.",
};

type OpsGuard =
  | { ok: true; code: DemoBrandCode; brandId: string }
  | { ok: false; message: string };

async function guardOps(): Promise<OpsGuard> {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ?? "BR-1";
  return { ok: true, code, brandId: getDemoBrandPack(code).brand.id };
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

type OpsListKey = "services" | "serviceJobs" | "appointments" | "tasks" | "shifts" | "visits";
type OpsOverrideKey =
  | "serviceOverrides"
  | "serviceJobOverrides"
  | "appointmentOverrides"
  | "taskOverrides"
  | "shiftOverrides"
  | "visitOverrides";

async function appendOps(code: DemoBrandCode, key: OpsListKey, entity: { id: string }) {
  await updateDemoMutableBucket(
    code,
    (bucket) =>
      ({
        ...bucket,
        [key]: [...((bucket[key] ?? []) as { id: string }[]), entity],
      }) as DemoMutableBucket,
  );
}

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

async function auditOps(
  guard: { code: DemoBrandCode; brandId: string },
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
) {
  await appendDemoAudit(guard.code, {
    brand_id: guard.brandId,
    actor_email: null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
}

export async function saveServiceAction(id: string | null, input: ServiceInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceInput(input);
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "serviceOverrides", id, parsed.value);
  } else {
    const service: Service = {
      id: newOpsId("svc"),
      brand_id: guard.brandId,
      ...parsed.value,
      isActive: true,
    };
    await appendOps(guard.code, "services", service);
    await auditOps(guard, "service.created", "service", service.id, service.name);
  }
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
  if (id) {
    await patchOps(guard.code, "serviceJobOverrides", id, parsed.value);
  } else {
    const job: ServiceJob = {
      id: newOpsId("job"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "requested",
    };
    await appendOps(guard.code, "serviceJobs", job);
    await auditOps(guard, "service_job.created", "service_job", job.id, job.notes || job.serviceId);
  }
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
  if (id) {
    await patchOps(guard.code, "appointmentOverrides", id, parsed.value);
  } else {
    const appointment: Appointment = {
      id: newOpsId("apt"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "scheduled",
    };
    await appendOps(guard.code, "appointments", appointment);
    await auditOps(guard, "appointment.created", "appointment", appointment.id, appointment.title);
  }
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
  if (id) {
    await patchOps(guard.code, "taskOverrides", id, parsed.value);
  } else {
    const task: Task = {
      id: newOpsId("task"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "open",
    };
    await appendOps(guard.code, "tasks", task);
    await auditOps(guard, "task.created", "task", task.id, task.title);
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
  if (id) {
    await patchOps(guard.code, "shiftOverrides", id, parsed.value);
  } else {
    const shift: Shift = { id: newOpsId("shift"), brand_id: guard.brandId, ...parsed.value };
    await appendOps(guard.code, "shifts", shift);
    await auditOps(guard, "shift.created", "shift", shift.id, `${shift.date} ${shift.start}-${shift.end}`);
  }
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
  if (id) {
    await patchOps(guard.code, "visitOverrides", id, parsed.value);
  } else {
    const visit: FieldVisit = {
      id: newOpsId("visit"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "planned",
      checkInAt: null,
      checkOutAt: null,
      report: null,
    };
    await appendOps(guard.code, "visits", visit);
    await auditOps(guard, "visit.created", "visit", visit.id, visit.purpose);
  }
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
