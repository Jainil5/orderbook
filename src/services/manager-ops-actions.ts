"use server";

import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  appendAudit,
  dropBrand,
  newRecordId,
  saveBrand,
  updateBrand,
} from "@/lib/csv/records";
import { listDemoStaff } from "@/lib/demo/staff-data";
import {
  validateAppointmentInput,
  type AppointmentInput,
} from "@/lib/manager/appointments";
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
  const { readDemoSessionBrandOrDefault } = await import(
    "@/lib/workspace/demo-session"
  );
  const code = await readDemoSessionBrandOrDefault();
  return { ok: true, code, brandId: getDemoBrandPack(code).brand.id };
}

/**
 * Ids this brand's operations rows may point at. The pack's arrays are the CSV
 * rows, so an appointment created five minutes ago is already in here.
 */
async function knownIds(code: DemoBrandCode) {
  const pack = getDemoBrandPack(code);
  const staff = await listDemoStaff(code);
  return {
    customerIds: pack.customers.map((c) => c.id),
    staffIds: staff.map((s) => s.id),
    serviceIds: pack.services.map((s) => s.id),
  };
}

function revalidateOps(modulePath: string) {
  revalidatePath("/manager");
  revalidatePath(modulePath);
  revalidatePath("/customers", "layout");
}

function auditOps(
  guard: { code: DemoBrandCode; brandId: string },
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
) {
  appendAudit(guard.brandId, {
    actor_email: null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
}

/**
 * `false` from a write means the row is not this brand's — a stale tab, or an id
 * from another workspace. The actions answer with the same "not found" the
 * bucket-era checks produced rather than reporting a save that never landed.
 */
const NOT_FOUND = (label: string) => ({
  ok: false as const,
  message: `${label} not found.`,
});

export async function saveServiceAction(id: string | null, input: ServiceInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceInput(input);
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("services", guard.brandId, id, parsed.value)) {
      return NOT_FOUND("Service");
    }
  } else {
    const service: Service = {
      id: newRecordId("svc"),
      brand_id: guard.brandId,
      ...parsed.value,
      isActive: true,
    };
    saveBrand("services", guard.brandId, service);
    auditOps(guard, "service.created", "service", service.id, service.name);
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("services", guard.brandId, id)) return NOT_FOUND("Service");
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function toggleServiceActiveAction(id: string, isActive: boolean) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!updateBrand("services", guard.brandId, id, { isActive })) {
    return NOT_FOUND("Service");
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function saveServiceJobAction(id: string | null, input: ServiceJobInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceJobInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("service_jobs", guard.brandId, id, parsed.value)) {
      return NOT_FOUND("Job");
    }
  } else {
    const job: ServiceJob = {
      id: newRecordId("job"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "requested",
    };
    saveBrand("service_jobs", guard.brandId, job);
    auditOps(guard, "service_job.created", "service_job", job.id, job.notes || job.serviceId);
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function advanceServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const job = getDemoBrandPack(guard.code).serviceJobs.find((j) => j.id === id);
  if (!job) return NOT_FOUND("Job");
  const error = jobAdvanceError(job);
  if (error) return { ok: false as const, message: error };
  if (!updateBrand("service_jobs", guard.brandId, id, { status: nextJobStatus(job.status) })) {
    return NOT_FOUND("Job");
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("service_jobs", guard.brandId, id)) return NOT_FOUND("Job");
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function saveAppointmentAction(id: string | null, input: AppointmentInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateAppointmentInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("appointments", guard.brandId, id, parsed.value)) {
      return NOT_FOUND("Appointment");
    }
  } else {
    const appointment: Appointment = {
      id: newRecordId("apt"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "scheduled",
    };
    saveBrand("appointments", guard.brandId, appointment);
    auditOps(guard, "appointment.created", "appointment", appointment.id, appointment.title);
  }
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function setAppointmentStatusAction(id: string, status: "completed" | "cancelled") {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const appointment = getDemoBrandPack(guard.code).appointments.find((a) => a.id === id);
  if (!appointment) return NOT_FOUND("Appointment");
  if (appointment.status !== "scheduled") {
    return { ok: false as const, message: "Only scheduled appointments can change status." };
  }
  if (!updateBrand("appointments", guard.brandId, id, { status })) {
    return NOT_FOUND("Appointment");
  }
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function deleteAppointmentAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("appointments", guard.brandId, id)) return NOT_FOUND("Appointment");
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function saveTaskAction(id: string | null, input: TaskInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateTaskInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("tasks", guard.brandId, id, parsed.value)) return NOT_FOUND("Task");
    revalidateOps("/manager/tasks");
    return { ok: true as const, id };
  }
  const task: Task = {
    id: newRecordId("task"),
    brand_id: guard.brandId,
    ...parsed.value,
    status: "open",
  };
  saveBrand("tasks", guard.brandId, task);
  auditOps(guard, "task.created", "task", task.id, task.title);
  revalidateOps("/manager/tasks");
  // The created id is part of the result because callers link to it: the CRM
  // stores it on the interaction that became this task, so the follow-up can
  // never turn into a second one.
  return { ok: true as const, id: task.id };
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  if (!["open", "in_progress", "done"].includes(status)) {
    return { ok: false as const, message: "Invalid status." };
  }
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!updateBrand("tasks", guard.brandId, id, { status })) return NOT_FOUND("Task");
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function deleteTaskAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("tasks", guard.brandId, id)) return NOT_FOUND("Task");
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function saveShiftAction(id: string | null, input: ShiftInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateShiftInput(input, (await knownIds(guard.code)).staffIds);
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("shifts", guard.brandId, id, parsed.value)) return NOT_FOUND("Shift");
  } else {
    const shift: Shift = { id: newRecordId("shift"), brand_id: guard.brandId, ...parsed.value };
    saveBrand("shifts", guard.brandId, shift);
    auditOps(guard, "shift.created", "shift", shift.id, `${shift.date} ${shift.start}-${shift.end}`);
  }
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}

export async function deleteShiftAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("shifts", guard.brandId, id)) return NOT_FOUND("Shift");
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}

export async function saveVisitAction(id: string | null, input: VisitInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateVisitInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    if (!updateBrand("visits", guard.brandId, id, parsed.value)) return NOT_FOUND("Visit");
  } else {
    const visit: FieldVisit = {
      id: newRecordId("visit"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "planned",
      checkInAt: null,
      checkOutAt: null,
      report: null,
    };
    saveBrand("visits", guard.brandId, visit);
    auditOps(guard, "visit.created", "visit", visit.id, visit.purpose);
  }
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkInVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const visit = getDemoBrandPack(guard.code).visits.find((v) => v.id === id);
  if (!visit) return NOT_FOUND("Visit");
  const error = visitTransitionError(visit, "check_in");
  if (error) return { ok: false as const, message: error };
  if (
    !updateBrand("visits", guard.brandId, id, {
      status: "checked_in",
      checkInAt: new Date().toISOString(),
    })
  ) {
    return NOT_FOUND("Visit");
  }
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkOutVisitAction(id: string, report: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const visit = getDemoBrandPack(guard.code).visits.find((v) => v.id === id);
  if (!visit) return NOT_FOUND("Visit");
  const error = visitTransitionError(visit, "check_out", report);
  if (error) return { ok: false as const, message: error };
  if (
    !updateBrand("visits", guard.brandId, id, {
      status: "completed",
      checkOutAt: new Date().toISOString(),
      report: report.trim().slice(0, 500),
    })
  ) {
    return NOT_FOUND("Visit");
  }
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function deleteVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  if (!dropBrand("visits", guard.brandId, id)) return NOT_FOUND("Visit");
  revalidateOps("/manager/visits");
  return { ok: true as const };
}
