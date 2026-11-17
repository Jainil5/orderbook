"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { updateDemoMutableBucket } from "@/lib/demo/mutable-store";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { DEMO_LIMITS, limitMessage } from "@/lib/demo/read-only";
import { validateStaffInput, type StaffInput } from "@/lib/manager/staff";
import { newOpsId } from "@/lib/manager/ops-shared";
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
  const existing = await listDemoStaff(code);
  if (existing.length >= DEMO_LIMITS.staff) {
    return { ok: false as const, message: limitMessage("The staff list is full") };
  }
  const member: StaffMember = {
    id: newOpsId("demo-staff"),
    brand_id: pack.brand.id,
    status: "active",
    availability: "available",
    created_at: new Date().toISOString(),
    ...parsed.value,
  };
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staff: [member, ...(bucket.staff ?? [])],
  }));
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
