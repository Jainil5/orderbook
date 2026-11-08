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
import { newOpsId } from "@/lib/manager/ops-shared";
import {
  jobAdvanceError,
  nextJobStatus,
  validateServiceInput,
  validateServiceJobInput,
  type ServiceInput,
  type ServiceJobInput,
} from "@/lib/manager/services";
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Service, ServiceJob } from "@/types/operations";

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
  await patchOps(guard.code, "serviceOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function toggleServiceActiveAction(id: string, isActive: boolean) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
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
  const pack = getDemoBrandPack(guard.code);
  const ops = mergeOperations(pack, await readDemoMutableBucket(guard.code));
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
  await patchOps(guard.code, "serviceJobOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}
