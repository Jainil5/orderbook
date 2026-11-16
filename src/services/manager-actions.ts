"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { appendAudit, newRecordId, saveBrand, updateBrand } from "@/lib/csv/records";
import { validateStaffInput, type StaffInput } from "@/lib/manager/staff";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { canEditBrandSettings } from "@/lib/security/authorization";
import { readDemoSessionBrand } from "@/lib/workspace/demo-session";
import {
  DEFAULT_DEMO_BRAND_CODE,
  type DemoBrandCode,
} from "@/lib/workspace/constants";
import type { StaffAvailability, StaffMember } from "@/types/manager";

const LIVE_UNAVAILABLE = {
  ok: false as const,
  message: "Staff management is not connected to live workspaces yet.",
};

async function resolveDemoBrandCode(): Promise<DemoBrandCode> {
  return (await readDemoSessionBrand()) ?? DEFAULT_DEMO_BRAND_CODE;
}

function revalidateManager() {
  revalidatePath("/manager");
  revalidatePath("/manager/staff");
}

export async function createStaffAction(input: StaffInput) {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const member: StaffMember = {
    id: newRecordId("staff"),
    brand_id: brandId,
    ...parsed.value,
    status: "active",
    availability: "available",
    created_at: new Date().toISOString(),
  };
  saveBrand("staff", brandId, member);
  appendAudit(brandId, {
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
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  if (!updateBrand("staff", getDemoBrandPack(code).brand.id, id, parsed.value)) {
    return { ok: false as const, message: "Staff member not found." };
  }
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
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const code = await resolveDemoBrandCode();
  if (!updateBrand("staff", getDemoBrandPack(code).brand.id, id, { availability })) {
    return { ok: false as const, message: "Staff member not found." };
  }
  revalidateManager();
  return { ok: true as const };
}

export async function setStaffStatusAction(id: string, status: "active" | "inactive") {
  if (status !== "active" && status !== "inactive") {
    return { ok: false as const, message: "Invalid status." };
  }
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const code = await resolveDemoBrandCode();
  if (!updateBrand("staff", getDemoBrandPack(code).brand.id, id, { status })) {
    return { ok: false as const, message: "Staff member not found." };
  }
  revalidateManager();
  return { ok: true as const };
}
