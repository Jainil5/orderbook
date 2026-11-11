"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { appendDemoAudit, updateDemoMutableBucket } from "@/lib/demo/mutable-store";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { validateStaffInput, type StaffInput } from "@/lib/manager/staff";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { StaffAvailability, StaffMember } from "@/types/manager";

async function resolveDemoBrandCode() {
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  return (
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ??
    "BR-1"
  );
}

function revalidateManager() {
  revalidatePath("/manager");
  revalidatePath("/manager/staff");
}

/**
 * Existence guard for the override writers: a stale row in another tab would
 * otherwise write an override for an id that no longer resolves and report a
 * dishonest success.
 */
async function hasStaffRecord(code: DemoBrandCode, id: string) {
  return (await listDemoStaff(code)).some((member) => member.id === id);
}

const STAFF_NOT_FOUND = { ok: false as const, message: "Staff member not found." };

export async function createStaffAction(input: StaffInput) {
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const member: StaffMember = {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brand_id: pack.brand.id,
    ...parsed.value,
    status: "active",
    availability: "available",
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staff: [...(bucket.staff ?? []), member],
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "staff.created",
    entity_type: "staff",
    entity_id: member.id,
    detail: member.name,
  });
  revalidateManager();
  return { ok: true as const };
}

export async function updateStaffAction(id: string, input: StaffInput) {
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  if (!(await hasStaffRecord(code, id))) return STAFF_NOT_FOUND;
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], ...parsed.value },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}

export async function setStaffAvailabilityAction(
  id: string,
  availability: StaffAvailability,
) {
  if (!["available", "busy", "off"].includes(availability)) {
    return { ok: false as const, message: "Invalid availability." };
  }
  const code = await resolveDemoBrandCode();
  if (!(await hasStaffRecord(code, id))) return STAFF_NOT_FOUND;
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], availability },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}

export async function setStaffStatusAction(id: string, status: "active" | "inactive") {
  if (status !== "active" && status !== "inactive") {
    return { ok: false as const, message: "Invalid status." };
  }
  const code = await resolveDemoBrandCode();
  if (!(await hasStaffRecord(code, id))) return STAFF_NOT_FOUND;
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], status },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}
