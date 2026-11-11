"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  readManagerModulesPref,
  writeBrandWebsitePref,
  writeManagerModulesPref,
  writeQuotationBuilderPref,
  writeReceiptSettingsPref,
} from "@/lib/workspace/prefs";
import { isManagerModuleKey } from "@/lib/workspace/manager-modules";
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
