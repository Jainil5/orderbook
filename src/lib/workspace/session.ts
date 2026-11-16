import { cookies } from "next/headers";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { demoWorkspaceMeta } from "@/lib/demo/server";
import {
  DEMO_WORKSPACE_COOKIE,
  getWorkspaceProfile,
  parseDemoBrandCodeFromCookie,
  type WorkspaceProfile,
} from "@/lib/workspace/constants";
import {
  readBrandWebsitePref,
  readIndustryPref,
  readManagerModulesPref,
  readQuotationBuilderPref,
  readReceiptSettingsPref,
} from "@/lib/workspace/prefs";
import {
  isIndustryId,
  type IndustryId,
} from "@/lib/workspace/managers";
import type { ManagerModuleKey } from "@/lib/workspace/manager-modules";
import type { Brand, BrandMember, BrandRole, BrandSettings } from "@/types/database";

function resolveIndustry(
  brandCode: string,
  profileIndustry: IndustryId,
): Promise<IndustryId> {
  return readIndustryPref(brandCode).then((pref) =>
    isIndustryId(pref) ? pref : profileIndustry,
  );
}

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

export type WorkspaceSession =
  | {
      mode: "live";
      brand: Brand;
      settings: BrandSettings;
      userEmail: string | null | undefined;
      member: BrandMember;
      role: BrandRole;
      profile: WorkspaceProfile;
      industry: IndustryId;
      hiddenManagerModules: ManagerModuleKey[];
    }
  | {
      mode: "demo";
      brand: Brand;
      settings: BrandSettings;
      userEmail: null;
      role: "owner";
      profile: WorkspaceProfile;
      industry: IndustryId;
      hiddenManagerModules: ManagerModuleKey[];
    };

export async function isDemoWorkspaceCookieSet(): Promise<boolean> {
  const cookieStore = await cookies();
  return parseDemoBrandCodeFromCookie(
    cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
  ) !== null;
}

export async function loadWorkspaceSession(): Promise<WorkspaceSession | null> {
  const live = await loadLiveWorkspace();
  if (live) {
    const settings = await mergeBrandSettings(live.settings, live.brand.code);
    const hiddenManagerModules =
      (await readManagerModulesPref(live.brand.code)) ?? [];
    const profile = getWorkspaceProfile(live.brand.code);
    return {
      mode: "live",
      brand: live.brand,
      settings,
      userEmail: live.userEmail,
      member: live.member,
      role: live.member.role,
      profile,
      industry: await resolveIndustry(live.brand.code, profile.industry),
      hiddenManagerModules,
    };
  }

  if (await isDemoWorkspaceCookieSet()) {
    const meta = await demoWorkspaceMeta();
    const settings = await mergeBrandSettings(meta.settings, meta.brand.code);
    const hiddenManagerModules =
      (await readManagerModulesPref(meta.brand.code)) ?? [];
    const profile = getWorkspaceProfile(meta.brand.code);
    return {
      mode: "demo",
      brand: meta.brand,
      settings,
      userEmail: null,
      role: "owner",
      profile,
      industry: await resolveIndustry(meta.brand.code, profile.industry),
      hiddenManagerModules,
    };
  }

  return null;
}
