import type { ServiceJob, ServiceJobStatus } from "@/types/operations";

export const SERVICE_JOB_STATUSES: ServiceJobStatus[] = [
  "requested",
  "scheduled",
  "in_progress",
  "completed",
];

export const SERVICE_JOB_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export type ServiceInput = {
  name: string;
  description?: string;
  durationMinutes: string;
  price: string;
};

export function validateServiceInput(
  input: ServiceInput,
):
  | { ok: true; value: { name: string; description: string; durationMinutes: number; price: number } }
  | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "Name is required." };
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    return { ok: false, message: "Duration must be 5–480 minutes." };
  }
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
    return { ok: false, message: "Enter a valid price." };
  }
  return {
    ok: true,
    value: {
      name,
      description: (input.description ?? "").trim().slice(0, 300),
      durationMinutes,
      price: Math.round(price * 100) / 100,
    },
  };
}

export function nextJobStatus(status: ServiceJobStatus): ServiceJobStatus | null {
  const i = SERVICE_JOB_STATUSES.indexOf(status);
  return i >= 0 && i < SERVICE_JOB_STATUSES.length - 1 ? SERVICE_JOB_STATUSES[i + 1] : null;
}

export function jobAdvanceError(job: ServiceJob): string | null {
  const next = nextJobStatus(job.status);
  if (!next) return "Job is already completed.";
  if (next === "scheduled" && (job.staffIds.length === 0 || !job.scheduledAt)) {
    return "Assign staff and a schedule before scheduling a job.";
  }
  return null;
}

export type ServiceJobInput = {
  serviceId: string;
  customerId: string;
  staffIds: string[];
  scheduledAt?: string;
  notes?: string;
};

export function validateServiceJobInput(
  input: ServiceJobInput,
  known: { serviceIds: string[]; customerIds: string[]; staffIds: string[] },
):
  | { ok: true; value: { serviceId: string; customerId: string; staffIds: string[]; scheduledAt: string | null; notes: string } }
  | { ok: false; message: string } {
  if (!known.serviceIds.includes(input.serviceId)) return { ok: false, message: "Pick a valid service." };
  if (!known.customerIds.includes(input.customerId)) return { ok: false, message: "Pick a valid customer." };
  if (input.staffIds.some((id) => !known.staffIds.includes(id))) {
    return { ok: false, message: "Pick valid staff members." };
  }
  let scheduledAt: string | null = null;
  if (input.scheduledAt) {
    const t = new Date(input.scheduledAt);
    if (Number.isNaN(t.getTime())) return { ok: false, message: "Enter a valid schedule time." };
    scheduledAt = t.toISOString();
  }
  return {
    ok: true,
    value: {
      serviceId: input.serviceId,
      customerId: input.customerId,
      staffIds: input.staffIds,
      scheduledAt,
      notes: (input.notes ?? "").trim().slice(0, 300),
    },
  };
}
