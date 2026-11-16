/**
 * Workspace settings storage: one `brand_settings` row per brand in
 * `data/brand_settings.csv`.
 *
 * These are exactly the values the `/settings` screen edits — brand details,
 * which Manager sections are hidden, the industry choice, integration status
 * and the AI decisions. They used to live in an httpOnly cookie, which meant a
 * settings change was only visible inside that browser; in a CSV row the owner
 * can see and edit the same values offline, and a fresh container keeps them.
 *
 * Presence rule, shared with `src/lib/workspace/session.ts`: a pref that was
 * never set reads back as `undefined`, which means "the fixtures decide", while
 * an explicit `null` means "the owner cleared it". `seed.ts` writes each demo
 * brand's row from that brand's own fixture settings, so for the demo brands
 * every settings column already holds a real answer and only the columns the
 * app has never written (`industry`, `hidden_manager_modules`, `integrations`,
 * the AI keys) stay blank and read as `undefined`. A brand with no row yet gets
 * one on its first save, created from that save's values.
 *
 * The functions stay `async` like the cookie calls they replaced, so the
 * workspace session and the server actions keep their `await` sites unchanged;
 * the store underneath is synchronous.
 */

import {
  parseHiddenManagerModules,
  type ManagerModuleKey,
} from "@/lib/workspace/manager-modules";
import { DEMO_BRAND_CODES, type DemoBrandCode } from "@/lib/workspace/constants";
import { csvBrandId } from "@/lib/csv/source";
import { findBrand, saveBrand, updateBrand } from "@/lib/csv/records";
import type { IntegrationPrefs } from "@/types/integrations";

export type PrefsEntry = {
  quotationBuilderEnabled?: boolean;
  brandWebsiteUrl?: string | null;
  receiptHeader?: string;
  receiptFooter?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  hiddenManagerModules?: string[];
  industry?: string;
  /** Status only — see src/lib/integrations/state.ts. No credentials live here. */
  integrations?: IntegrationPrefs;
  /** AI area — automation rule id -> enabled. Read/written via src/lib/ai/prefs-store.ts. */
  aiAutomationPrefs?: Record<string, boolean>;
  /** AI area — proposal id -> last human decision, so the inbox does not refill itself. */
  aiProposalLog?: Record<
    string,
    {
      status: "accepted" | "rejected";
      at: string;
      outcomeHref?: string;
      outcomeLabel?: string;
    }
  >;
};

/**
 * The `brand_settings` columns this module reads. `json` cells decode to
 * `unknown` (`decodeCell` never refuses a bad value), so the object/array
 * columns are narrowed on the way out rather than trusted.
 */
type BrandSettingsRow = {
  id: string;
  brand_id: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  quotation_builder_enabled: boolean;
  brand_website_url: string | null;
  industry: string | null;
  hidden_manager_modules: unknown;
  integrations: unknown;
  ai_automations: unknown;
  ai_proposals: unknown;
  updated_at: string;
};

/**
 * Which row a brand code's settings live in. Demo codes resolve to the pack's
 * brand id so `brand_settings.csv` shows the same `brand_id` as every other
 * table; anything else keys a row of its own, the way the cookie keyed each
 * code separately — a live brand's settings must never be written into a demo
 * brand's row.
 */
function brandRowId(brandCode: string): string {
  const code = brandCode.trim().toUpperCase();
  const demo = (DEMO_BRAND_CODES as readonly string[]).includes(code)
    ? (code as DemoBrandCode)
    : null;
  return demo ? csvBrandId(demo) : code;
}

function readRow(brandCode: string): BrandSettingsRow | null {
  const id = brandRowId(brandCode);
  // `id` doubles as `brand_id` (see seed.ts), so the tenancy check in
  // `findBrand` is what keeps another brand's row out of sight.
  return findBrand<BrandSettingsRow>("brand_settings", id, id);
}

/* ------------------------------------------------------------------ */
/* row <-> PrefsEntry                                                  */
/* ------------------------------------------------------------------ */

/**
 * Row -> entry, the whole row at once so every reader takes the fields it
 * needs. A blank cell in a column whose pref cannot hold `null` is "never set"
 * and becomes `undefined`; a blank in a nullable column stays `null`, which is
 * how a cleared field is stored.
 */
function prefsFromRow(row: BrandSettingsRow): PrefsEntry {
  // The json columns are whatever the file says, and an owner can hand-edit a
  // cell: keep only object-shaped values, since nothing else validates them.
  const asRecord = <T,>(value: unknown): T | undefined =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as T)
      : undefined;
  return {
    quotationBuilderEnabled: row.quotation_builder_enabled,
    brandWebsiteUrl: row.brand_website_url,
    receiptHeader: row.receipt_header ?? undefined,
    receiptFooter: row.receipt_footer,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    hiddenManagerModules:
      row.hidden_manager_modules === null ||
      row.hidden_manager_modules === undefined
        ? undefined
        : parseHiddenManagerModules(row.hidden_manager_modules),
    industry: row.industry ?? undefined,
    integrations: asRecord<IntegrationPrefs>(row.integrations),
    aiAutomationPrefs: asRecord<Record<string, boolean>>(row.ai_automations),
    aiProposalLog: asRecord<PrefsEntry["aiProposalLog"]>(row.ai_proposals),
  };
}

/**
 * Entry -> columns, for the keys the caller actually touched: an absent key
 * leaves its cell alone, which is the merge the cookie did, and `readPrefsEntry`
 * never omits a key, so spreading a whole entry as a patch stays safe.
 */
function columnsFromPrefs(patch: PrefsEntry): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if ("quotationBuilderEnabled" in patch)
    columns.quotation_builder_enabled = Boolean(patch.quotationBuilderEnabled);
  if ("brandWebsiteUrl" in patch)
    columns.brand_website_url = patch.brandWebsiteUrl ?? null;
  if ("receiptHeader" in patch) columns.receipt_header = patch.receiptHeader ?? null;
  if ("receiptFooter" in patch) columns.receipt_footer = patch.receiptFooter ?? null;
  if ("contactEmail" in patch) columns.contact_email = patch.contactEmail ?? null;
  if ("contactPhone" in patch) columns.contact_phone = patch.contactPhone ?? null;
  if ("hiddenManagerModules" in patch)
    columns.hidden_manager_modules = patch.hiddenManagerModules ?? null;
  if ("industry" in patch) columns.industry = patch.industry ?? null;
  if ("integrations" in patch) columns.integrations = patch.integrations ?? null;
  if ("aiAutomationPrefs" in patch)
    columns.ai_automations = patch.aiAutomationPrefs ?? null;
  if ("aiProposalLog" in patch) columns.ai_proposals = patch.aiProposalLog ?? null;
  return columns;
}

/**
 * Merge `patch` into the brand's row, stamping `updated_at`. A brand outside
 * the demo packs has no seeded row, so the first save creates it — from the
 * patch, which is the only truth available for a brand whose fixtures this
 * process cannot read.
 */
function saveBrandSettingsRow(brandCode: string, patch: PrefsEntry): void {
  const id = brandRowId(brandCode);
  const columns = {
    ...columnsFromPrefs(patch),
    updated_at: new Date().toISOString(),
  };
  if (updateBrand("brand_settings", id, id, columns)) return;
  saveBrand("brand_settings", id, { id, brand_id: id, ...columns });
}

/* ------------------------------------------------------------------ */
/* The prefs API                                                       */
/* ------------------------------------------------------------------ */

export async function readQuotationBuilderPref(
  brandCode: string,
): Promise<boolean | undefined> {
  const row = readRow(brandCode);
  return row ? row.quotation_builder_enabled : undefined;
}

export async function writeQuotationBuilderPref(
  brandCode: string,
  enabled: boolean,
): Promise<void> {
  saveBrandSettingsRow(brandCode, { quotationBuilderEnabled: enabled });
}

export async function readBrandWebsitePref(
  brandCode: string,
): Promise<string | null | undefined> {
  const row = readRow(brandCode);
  return row ? row.brand_website_url : undefined;
}

export async function writeBrandWebsitePref(
  brandCode: string,
  url: string | null,
): Promise<void> {
  saveBrandSettingsRow(brandCode, { brandWebsiteUrl: url });
}

export async function readReceiptSettingsPref(
  brandCode: string,
): Promise<
  | {
      receiptHeader?: string;
      receiptFooter?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
    }
  | undefined
> {
  const row = readRow(brandCode);
  if (!row) return undefined;
  return {
    receiptHeader: row.receipt_header ?? undefined,
    receiptFooter: row.receipt_footer,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
  };
}

export async function writeReceiptSettingsPref(
  brandCode: string,
  values: {
    receiptHeader: string;
    receiptFooter: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  },
): Promise<void> {
  saveBrandSettingsRow(brandCode, {
    receiptHeader: values.receiptHeader,
    receiptFooter: values.receiptFooter,
    contactEmail: values.contactEmail,
    contactPhone: values.contactPhone,
  });
}

export async function readManagerModulesPref(
  brandCode: string,
): Promise<ManagerModuleKey[] | undefined> {
  const row = readRow(brandCode);
  const raw = row?.hidden_manager_modules;
  return raw === null || raw === undefined
    ? undefined
    : parseHiddenManagerModules(raw);
}

export async function writeManagerModulesPref(
  brandCode: string,
  hidden: ManagerModuleKey[],
): Promise<void> {
  await updatePrefsEntry(brandCode, { hiddenManagerModules: hidden });
}

/**
 * Generic pref access so feature areas never add one-off readers. Values are
 * per brand and live in that brand's `brand_settings` row; the namespaced keys
 * (`integrations`, `ai_automations`, `ai_proposals`) keep one area's write from
 * disturbing another's.
 */
export async function readPrefsEntry(brandCode: string): Promise<PrefsEntry> {
  const row = readRow(brandCode);
  return row ? prefsFromRow(row) : {};
}

export async function updatePrefsEntry(
  brandCode: string,
  patch: PrefsEntry,
): Promise<void> {
  saveBrandSettingsRow(brandCode, patch);
}

export async function readIndustryPref(
  brandCode: string,
): Promise<string | undefined> {
  return readRow(brandCode)?.industry ?? undefined;
}
