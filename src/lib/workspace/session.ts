import { cookies } from "next/headers";
import { demoWorkspaceMeta } from "@/lib/demo/server";
import {
  DEMO_WORKSPACE_COOKIE,
  getWorkspaceProfile,
  parseDemoBrandCodeFromCookie,
  type WorkspaceProfile,
} from "@/lib/workspace/constants";
import {
  readBrandWebsitePref,
  readManagerModulesPref,
  readQuotationBuilderPref,
  readReceiptSettingsPref,
} from "@/lib/workspace/prefs";
import type { ManagerModuleKey } from "@/lib/workspace/manager-modules";
import type { Brand, BrandSettings } from "@/types/database";

async function mergeBrandSettings(
  settings: BrandSettings,
  brandCode: string,
): Promise<BrandSettings> {
  const quotationPref = await readQuotationBuilderPref(brandCode);
  const websitePref = await readBrandWebsitePref(brandCode);
  let next = settings;
  if (quotationPref !== undefined) {
    next = { ...next, quotation_builder_enabled: quotationPref };
  }
  if (websitePref !== undefined) {
    next = { ...next, brand_website_url: websitePref };
  }
  const receiptPref = await readReceiptSettingsPref(brandCode);
  if (receiptPref) {
    next = {
      ...next,
      receipt_header: receiptPref.receiptHeader ?? next.receipt_header,
      receipt_footer: receiptPref.receiptFooter ?? next.receipt_footer,
      contact_email: receiptPref.contactEmail ?? next.contact_email,
      contact_phone: receiptPref.contactPhone ?? next.contact_phone,
    };
  }
  return next;
}

export type WorkspaceSession = {
  mode: "demo";
  brand: Brand;
  settings: BrandSettings;
  role: "owner";
  profile: WorkspaceProfile;
  hiddenManagerModules: ManagerModuleKey[];
};

export async function isDemoWorkspaceCookieSet(): Promise<boolean> {
  const cookieStore = await cookies();
  return parseDemoBrandCodeFromCookie(
    cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
  ) !== null;
}

export async function loadWorkspaceSession(): Promise<WorkspaceSession | null> {
  if (await isDemoWorkspaceCookieSet()) {
    const meta = await demoWorkspaceMeta();
    const settings = await mergeBrandSettings(meta.settings, meta.brand.code);
    const hiddenManagerModules =
      (await readManagerModulesPref(meta.brand.code)) ?? [];
    return {
      mode: "demo",
      brand: meta.brand,
      settings,
      role: "owner",
      profile: getWorkspaceProfile(meta.brand.code),
      hiddenManagerModules,
    };
  }

  return null;
}
