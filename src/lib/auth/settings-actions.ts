"use server";

import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import {
  readManagerModulesPref,
  writeBrandWebsitePref,
  writeManagerModulesPref,
  writeQuotationBuilderPref,
} from "@/lib/workspace/prefs";
import { isManagerModuleKey } from "@/lib/workspace/manager-modules";
import { normalizeBrandWebsiteUrl } from "@/lib/security/input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEditBrandSettings } from "@/lib/security/authorization";

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

  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(
      cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
    ) ?? "BR-1";
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

  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(
      cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
    ) ?? "BR-1";
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
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(
      cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
    ) ?? "BR-1";
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

  const live = await loadLiveWorkspace();
  if (live && !canEditBrandSettings(live.member.role)) {
    return { ok: false as const, message: "Not allowed." };
  }

  // No brand_settings column exists for this yet; the cookie pref is the
  // store for both modes until the live schema catches up.
  const brandCode = live
    ? live.brand.code
    : await (async () => {
        const { cookies } = await import("next/headers");
        const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } =
          await import("@/lib/workspace/constants");
        const cookieStore = await cookies();
        return (
          parseDemoBrandCodeFromCookie(
            cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
          ) ?? "BR-1"
        );
      })();

  const current = (await readManagerModulesPref(brandCode)) ?? [];
  const next = hidden
    ? Array.from(new Set([...current, moduleKey]))
    : current.filter((k) => k !== moduleKey);
  await writeManagerModulesPref(brandCode, next);
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { ok: true as const };
}
