"use server";

import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import {
  readManagerModulesPref,
  updatePrefsEntry,
  writeBrandWebsitePref,
  writeManagerModulesPref,
  writeQuotationBuilderPref,
} from "@/lib/workspace/prefs";
import { isManagerModuleKey } from "@/lib/workspace/manager-modules";
import { getIndustryPreset, isIndustryId } from "@/lib/workspace/managers";
import { normalizeBrandWebsiteUrl } from "@/lib/security/input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEditBrandSettings } from "@/lib/security/authorization";
import {
  DEFAULT_DEMO_BRAND_CODE,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

/**
 * Brand code for the active demo workspace, from its session row. Every
 * setting below is keyed by brand, so an unknown session has no brand to write
 * to and falls back to the first demo workspace, the same way the screens do.
 */
async function activeBrandCode(): Promise<DemoBrandCode> {
  const { readDemoSessionBrand } = await import(
    "@/lib/workspace/demo-session"
  );
  return (await readDemoSessionBrand()) ?? DEFAULT_DEMO_BRAND_CODE;
}

export async function setQuotationBuilderEnabled(enabled: boolean) {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, code: "FORBIDDEN" as const, message: "Not allowed." };
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("brand_settings")
      .update({ quotation_builder_enabled: enabled })
      .eq("brand_id", live.brand.id);

    if (error) {
      await writeQuotationBuilderPref(live.brand.code, enabled);
    }
    revalidatePath("/settings");
    revalidatePath("/billing");
    revalidatePath("/quotation");
    return { ok: true as const };
  }

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

  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, code: "FORBIDDEN" as const, message: "Not allowed." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("brand_settings")
      .update({ brand_website_url: normalized })
      .eq("brand_id", live.brand.id);

    if (error) {
      await writeBrandWebsitePref(live.brand.code, normalized);
    }
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true as const, url: normalized };
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

  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("brand_settings")
      .update({
        receipt_header: header,
        receipt_footer: footer || null,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      })
      .eq("brand_id", live.brand.id);
    if (error) {
      return { ok: false as const, message: "Could not save settings." };
    }
    revalidatePath("/settings");
    revalidatePath("/billing");
    revalidatePath("/quotation");
    return { ok: true as const };
  }

  const { writeReceiptSettingsPref } = await import("@/lib/workspace/prefs");
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

/**
 * Switch the workspace to a business-type preset. The preset hides the
 * sections that business type usually does not run; anything the owner had
 * already turned off stays off, and every section can be re-enabled by hand.
 */
export async function applyIndustryPreset(industryId: string) {
  if (!isIndustryId(industryId)) {
    return { ok: false as const, message: "Unknown business type." };
  }

  const live = await loadLiveWorkspace();
  if (live && !canEditBrandSettings(live.member.role)) {
    return { ok: false as const, message: "Not allowed." };
  }

  const brandCode = live ? live.brand.code : await activeBrandCode();
  const preset = getIndustryPreset(industryId)!;
  const current = (await readManagerModulesPref(brandCode)) ?? [];
  const hidden = Array.from(
    new Set([...current, ...preset.hiddenSections].filter(isManagerModuleKey)),
  );

  await writeManagerModulesPref(brandCode, hidden);
  await updatePrefsEntry(brandCode, { industry: preset.id });
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { ok: true as const, hidden };
}

/** Show or hide one Manager section without touching the rest. */
export async function setManagerSectionsHidden(
  keys: string[],
  hidden: boolean,
) {
  const valid = keys.filter(isManagerModuleKey);
  if (valid.length !== keys.length) {
    return { ok: false as const, message: "Unknown module." };
  }

  const live = await loadLiveWorkspace();
  if (live && !canEditBrandSettings(live.member.role)) {
    return { ok: false as const, message: "Not allowed." };
  }

  const brandCode = live ? live.brand.code : await activeBrandCode();
  const current = (await readManagerModulesPref(brandCode)) ?? [];
  const next = hidden
    ? Array.from(new Set([...current, ...valid]))
    : current.filter((k) => !valid.includes(k));

  await writeManagerModulesPref(brandCode, next);
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { ok: true as const, hidden: next };
}
