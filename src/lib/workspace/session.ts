import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { readDemoSessionBrand } from "@/lib/workspace/demo-session";
import {
  getWorkspaceProfile,
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

/**
 * The workspace a request is in.
 *
 * A live Supabase session wins when there is one; otherwise the demo workspace
 * comes from `data/sessions.csv` — the row the login screen wrote. No row means
 * no workspace, and every workspace route sends the browser to the login
 * screen, which is exactly what it did when the cookie was the only record.
 */
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

  const demoBrandCode = await readDemoSessionBrand();
  if (demoBrandCode) {
    const pack = getDemoBrandPack(demoBrandCode);
    const settings = await mergeBrandSettings(pack.settings, pack.brand.code);
    const hiddenManagerModules =
      (await readManagerModulesPref(pack.brand.code)) ?? [];
    const profile = getWorkspaceProfile(pack.brand.code);
    return {
      mode: "demo",
      brand: pack.brand,
      settings,
      userEmail: null,
      role: "owner",
      profile,
      industry: await resolveIndustry(pack.brand.code, profile.industry),
      hiddenManagerModules,
    };
  }

  return null;
}
