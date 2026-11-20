"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  readManagerModulesPref,
  writeBlockOversellPref,
  writeBrandWebsitePref,
  writeManagerModulesPref,
  writeOrdersPausedPref,
  writeQuotationBuilderPref,
  writeReceiptSettingsPref,
  writeWorkingHoursPref,
} from "@/lib/workspace/prefs";
import { isManagerModuleKey } from "@/lib/workspace/manager-modules";
import { validateWorkingHours } from "@/lib/hours/working-hours";
import { normalizeBrandWebsiteUrl } from "@/lib/security/input";
import {
  DEMO_WORKSPACE_COOKIE,
  parseDemoBrandCodeFromCookie,
} from "@/lib/workspace/constants";

async function activeBrandCode() {
  const cookieStore = await cookies();
  return (
    parseDemoBrandCodeFromCookie(
      cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
    ) ?? "BR-1"
  );
}

export async function setQuotationBuilderEnabled(enabled: boolean) {
  const code = await activeBrandCode();
  await writeQuotationBuilderPref(code, enabled);
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true as const };
}

export async function setBrandWebsiteUrl(raw: string) {
  const normalized = normalizeBrandWebsiteUrl(raw);
  if (raw.trim() && normalized === null) {
    return {
      ok: false as const,
      code: "VALIDATION" as const,
      message: "Enter a valid https:// link or leave the field empty.",
    };
  }

  const code = await activeBrandCode();
  await writeBrandWebsitePref(code, normalized);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true as const, url: normalized };
}

export async function setReceiptSettings(input: {
  receiptHeader: string;
  receiptFooter: string;
  contactEmail: string;
  contactPhone: string;
}) {
  const header = input.receiptHeader.trim().slice(0, 200);
  const footer = input.receiptFooter.trim().slice(0, 500);
  const contactEmail = input.contactEmail.trim().slice(0, 120) || null;
  const contactPhone = input.contactPhone.trim().slice(0, 40) || null;

  const code = await activeBrandCode();
  await writeReceiptSettingsPref(code, {
    receiptHeader: header,
    receiptFooter: footer || null,
    contactEmail,
    contactPhone,
  });
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { ok: true as const };
}

export async function setManagerModuleHidden(moduleKey: string, hidden: boolean) {
  if (!isManagerModuleKey(moduleKey)) {
    return { ok: false as const, message: "Unknown module." };
  }

  const brandCode = await activeBrandCode();
  const current = (await readManagerModulesPref(brandCode)) ?? [];
  const next = hidden
    ? Array.from(new Set([...current, moduleKey]))
    : current.filter((k) => k !== moduleKey);
  await writeManagerModulesPref(brandCode, next);
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { ok: true as const };
}

/**
 * Save the week. The payload is whatever the editor posted — a plain object
 * or the JSON text a hidden field carries — and only a usable seven-day
 * schedule is stored. `raw` is never allowed to name a brand: tenancy comes
 * from the workspace cookie.
 */
export async function setWorkingHours(raw: unknown) {
  const parsed = validateWorkingHours(raw);
  if (!parsed.ok) {
    return { ok: false as const, message: parsed.message };
  }

  const brandCode = await activeBrandCode();
  await writeWorkingHoursPref(brandCode, parsed.value);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** The manual switch: "not taking orders right now", inside the hours or not. */
export async function setOrdersPaused(paused: boolean) {
  const brandCode = await activeBrandCode();
  await writeOrdersPausedPref(brandCode, paused);
  revalidatePath("/settings");
  revalidatePath("/menu");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Whether the counter refuses a sale the shelf cannot cover. Left unset by the
 * shipped pack, so this is remembered per brand rather than written to the CSV.
 */
export async function setBlockOversell(enabled: boolean) {
  const brandCode = await activeBrandCode();
  await writeBlockOversellPref(brandCode, enabled);
  revalidatePath("/settings");
  revalidatePath("/billing");
  revalidatePath("/quotation");
  return { ok: true as const };
}
