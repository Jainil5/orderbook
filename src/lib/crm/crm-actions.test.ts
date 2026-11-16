import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { WorkspaceSession } from "@/lib/workspace/session";
import type { AuditLogEntry, BrandRole, Customer } from "@/types/database";
import type { CrmTable } from "@/lib/crm/repository";
import type { CampaignInput } from "@/services/crm-campaign-actions";
import type { ReviewInput } from "@/services/crm-review-actions";
import type { SegmentInput } from "@/services/crm-segment-actions";

/**
 * Integration proof for the CRM `"use server"` actions themselves.
 * `crm.test.ts` covers the pure metric/loader/repository functions; this file
 * drives the real action entry points so the guarantees that only exist once
 * an action runs — permission gate, brand tenancy, consent gate, derived
 * counts — are actually tested.
 *
 * Everything lands in a temp `OB_DATA_DIR`, never in the checked-in `data/`.
 */

/** Pinned clock, so `created_at`/`updated_at`/`asOf` are assertable exactly. */
const AS_OF = "2026-06-15T09:00:00.000Z";
/** A later instant for the second write of the same row. */
const LATER = "2026-06-15T09:30:00.000Z";

/** Synthetic live-brand ids: the CSV store keys every row on `brand_id`. */
const BRAND_A = "actions-brand-a";
const BRAND_B = "actions-brand-b";
const CODE_A = "ACT-A";
const CODE_B = "ACT-B";

/* ------------------------------------------------------------------ */
/* Minimum mocks: the request-scoped things actions cannot run without  */
/* ------------------------------------------------------------------ */

// The session is the single source of role + brand, so it is the one thing
// worth faking. Every permission/tenancy assertion below flows through it.
vi.mock("@/lib/workspace/session", () => ({
  loadWorkspaceSession: vi.fn(),
}));

// `revalidateCrm` calls this on every write; Next refuses it outside a request.
// `next/navigation` (redirect, via actions-kit) loads cleanly here and is only
// ever reached by `crmReturnTo`, which no test calls — so it is not mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Kept as a stub so a stray `cookies()` call fails loudly in-test instead of
// throwing "next/headers can only be used in a Request". The CRM audit trail
// moved to `audit_log.csv`, so no action path reads cookies any more.
const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  })),
  headers: vi.fn(async () => new Headers()),
}));

/* ------------------------------------------------------------------ */
/* Fixture builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * A live session carrying only what the action path reads: `role` for
 * `guardCrm`, `brand.id`/`brand.code`/`tax_rate_percent` for
 * `csvBrandContext`, `settings.currency_code`/`profile.ordersNumberColumn`
 * for `loadCrmWorkspace`. A full `WorkspaceSession` would need Supabase,
 * which the CSV-first build never reaches.
 */
function sessionFor(
  brandId: string,
  brandCode: string,
  role: BrandRole,
): WorkspaceSession {
  return {
    mode: "live",
    brand: { id: brandId, code: brandCode, name: brandCode },
    settings: { brand_id: brandId, currency_code: "INR", tax_rate_percent: 0 },
    userEmail: "tester@example.invalid",
    member: { id: "member-1", brand_id: brandId, user_id: "user-1", role },
    role,
    profile: { ordersNumberColumn: "order_number" },
    industry: "cafe",
    hiddenManagerModules: [],
  } as unknown as WorkspaceSession;
}

async function signIn(who: WorkspaceSession | null): Promise<void> {
  const { loadWorkspaceSession } = await import("@/lib/workspace/session");
  vi.mocked(loadWorkspaceSession).mockResolvedValue(who);
}

/**
 * Consent coverage: one granted, one declined, one granted-then-opted-out,
 * one granted-then-archived, plus a granted customer of the OTHER brand so the
 * foreign-reference and tenancy tests have something real to reach for.
 */
async function seedData(): Promise<void> {
  const { upsertRow } = await import("@/lib/csv/store");
  const customer = (
    brandId: string,
    id: string,
    consent: Customer["marketing_consent"],
    extra: Partial<Customer> = {},
  ) =>
    upsertRow("customers", {
      id,
      brand_id: brandId,
      name: id,
      email: `${id}@example.invalid`,
      phone: null,
      marketing_consent: consent,
      ...extra,
    });

  customer(BRAND_A, "c-granted", "granted");
  customer(BRAND_A, "c-declined", "declined");
  customer(BRAND_A, "c-opted-out", "granted", {
    opted_out_at: "2026-05-01T00:00:00.000Z",
  });
  customer(BRAND_A, "c-archived", "granted", { status: "archived" });
  customer(BRAND_B, "c-foreign", "granted");

  const order = (
    id: string,
    brandId: string,
    customerId: string,
    grandTotal: number,
  ) =>
    upsertRow("orders", {
      id,
      brand_id: brandId,
      order_number: id.toUpperCase(),
      status: "completed",
      payment_status: "paid",
      customer_id: customerId,
      subtotal: grandTotal,
      discount_total: 0,
      tax_total: 0,
      fees_total: 0,
      grand_total: grandTotal,
      created_at: AS_OF,
    });

  order("o-mine", BRAND_A, "c-granted", 500);
  order("o-theirs", BRAND_B, "c-foreign", 9_999);

  upsertRow("staff", { id: "s-a1", brand_id: BRAND_A, name: "Asha" });
}

/** Re-read what an action really left on disk, through the typed repository. */
async function storedRows<T extends CrmTable>(
  brandId: string,
  table: T,
  brandCode = CODE_A,
) {
  const { CsvCrmRepository } = await import("@/lib/crm/repository");
  return new CsvCrmRepository(brandId, brandCode).list(table);
}

/** One row by id: null means the repository cannot resolve it for this brand. */
async function storedRow<T extends CrmTable>(
  brandId: string,
  table: T,
  id: string,
  brandCode = CODE_A,
) {
  const { CsvCrmRepository } = await import("@/lib/crm/repository");
  return new CsvCrmRepository(brandId, brandCode).find(table, id);
}

/** Simulate the world changing between two action calls. */
async function patchCustomer(id: string, extra: Partial<Customer>): Promise<void> {
  const { findRow, upsertRow } = await import("@/lib/csv/store");
  upsertRow("customers", { ...findRow("customers", id), ...extra });
}

function campaignInput(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    name: "Summer offer",
    type: "offer",
    channel: "whatsapp",
    status: "active",
    start_date: "2026-06-01",
    consent_only: true,
    ...overrides,
  };
}

function segmentInput(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    name: "Hand-picked",
    kind: "manual",
    manual_customer_ids: ["c-granted"],
    ...overrides,
  };
}

function reviewInput(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    source: "in_store",
    rating: 5,
    text: "Great service.",
    customer_id: "c-granted",
    ...overrides,
  };
}

/** The one recipient row of a campaign, failing loudly if there is not exactly one. */
async function onlyRecipient(campaignId: string) {
  const rows = (await storedRows(BRAND_A, "campaign_recipients")).filter(
    (r) => r.campaign_id === campaignId,
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function firstCampaign(brandId = BRAND_A, brandCode = CODE_A) {
  const rows = await storedRows(brandId, "marketing_campaigns", brandCode);
  expect(rows).toHaveLength(1);
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Temp data dir + clock                                               */
/* ------------------------------------------------------------------ */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(AS_OF));
  cookieJar.clear();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-crm-actions-"));
  process.env.OB_DATA_DIR = tmpDir;
  await seedData();
});

afterEach(() => {
  vi.useRealTimers();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

/* ------------------------------------------------------------------ */
/* a. Permission gate                                                  */
/* ------------------------------------------------------------------ */

describe("CRM actions — permission gate", () => {
  it("refuses a manage-scope campaign write for a role that cannot manage, and writes nothing", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "staff"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    const result = await saveCampaignAction(campaignInput());

    expect(result).toEqual({
      ok: false,
      message:
        "Only owners, admins and managers can change CRM settings, segments, campaigns or loyalty rules.",
    });
    expect(await storedRows(BRAND_A, "marketing_campaigns")).toEqual([]);
    expect(await storedRows(BRAND_A, "campaign_recipients")).toEqual([]);
  });

  it("refuses a manage-scope segment write for the same role and leaves the table untouched", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "staff"));
    const { saveSegmentAction } = await import("@/services/crm-segment-actions");

    const denied = await saveSegmentAction(segmentInput());

    expect(denied.ok).toBe(false);
    expect(await storedRows(BRAND_A, "customer_segments")).toEqual([]);

    // The same call as a manager proves the refusal came from the role, not
    // from the input.
    await signIn(sessionFor(BRAND_A, CODE_A, "manager"));
    const allowed = await saveSegmentAction(segmentInput());
    expect(allowed.ok).toBe(true);
    expect(await storedRows(BRAND_A, "customer_segments")).toHaveLength(1);
  });

  it("lets that same non-managing role record a review, because canLogCrmActivity allows staff", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "staff"));
    const { saveReviewAction } = await import("@/services/crm-review-actions");

    const result = await saveReviewAction(reviewInput());

    expect(result.ok).toBe(true);
    const reviews = await storedRows(BRAND_A, "customer_reviews");
    expect(reviews).toHaveLength(1);
    // brand_id is stamped from the session, never from the caller.
    expect(reviews[0].brand_id).toBe(BRAND_A);
    expect(reviews[0].response_status).toBe("unanswered");
  });

  it("refuses every action with no workspace session at all", async () => {
    await signIn(null);
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    expect(await saveCampaignAction(campaignInput())).toEqual({
      ok: false,
      message: "Not allowed.",
    });
    expect(await storedRows(BRAND_A, "marketing_campaigns")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* b. Consent gate                                                     */
/* ------------------------------------------------------------------ */

describe("CRM actions — marketing consent gate", () => {
  it("writes campaign_recipients rows only for consented customers, even when the audience names more", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveSegmentAction } = await import("@/services/crm-segment-actions");
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    // Four named customers: granted, declined, opted out, archived.
    const segmentResult = await saveSegmentAction(
      segmentInput({
        manual_customer_ids: [
          "c-granted",
          "c-declined",
          "c-opted-out",
          "c-archived",
        ],
      }),
    );
    expect(segmentResult.ok).toBe(true);
    const segment = (await storedRows(BRAND_A, "customer_segments"))[0];

    const saved = await saveCampaignAction(campaignInput({ segment_id: segment.id }));
    expect(saved.ok).toBe(true);

    const campaign = await firstCampaign();
    const rows = (await storedRows(BRAND_A, "campaign_recipients")).filter(
      (r) => r.campaign_id === campaign.id,
    );
    expect(rows.map((r) => r.customer_id)).toEqual(["c-granted"]);
    // The stored tally equals the rows actually written — never a typed number.
    expect(campaign.targeted_count).toBe(rows.length);
    expect(campaign.targeted_count).toBe(1);
  });

  it("keeps the consent filter on a consent_only:false campaign with no segment", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    const result = await saveCampaignAction(
      campaignInput({ segment_id: null, consent_only: false }),
    );

    expect(result.ok).toBe(true);
    const campaign = await firstCampaign();
    // Intent is recorded as asked, but the audience is still consent-filtered
    // from every live customer of the brand.
    expect(campaign.consent_only).toBe(false);
    const rows = (await storedRows(BRAND_A, "campaign_recipients")).filter(
      (r) => r.campaign_id === campaign.id,
    );
    expect(rows.map((r) => r.customer_id)).toEqual(["c-granted"]);
    expect(campaign.targeted_count).toBe(1);
    expect(rows.every((r) => r.brand_id === BRAND_A)).toBe(true);
  });

  it("drops a recipient whose consent is withdrawn when the audience is rebuilt", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, rebuildCampaignAudienceAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput({ segment_id: null }))).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);

    // The person opts out for real, then a human rebuilds the audience.
    await patchCustomer("c-granted", { opted_out_at: LATER });
    const rebuilt = await rebuildCampaignAudienceAction(campaign.id);

    expect(rebuilt.ok).toBe(true);
    expect(
      (await storedRows(BRAND_A, "campaign_recipients")).filter(
        (r) => r.campaign_id === campaign.id,
      ),
    ).toEqual([]);
    const stored = await firstCampaign();
    expect(stored.targeted_count).toBe(0);
    // The row really went, so there is nothing left to record an outcome on.
    expect(await storedRow(BRAND_A, "campaign_recipients", recipient.id)).toBeNull();
  });

  it("refuses to record an outcome for a customer who withdrew consent after being listed", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientSentAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);

    await patchCustomer("c-granted", { opted_out_at: LATER });
    vi.setSystemTime(new Date(LATER));
    const result = await markRecipientSentAction(recipient.id);

    expect(result).toEqual({
      ok: false,
      message:
        "Not recorded. That customer opted out of marketing on 2026-06-15.",
    });
    const row = await storedRow(BRAND_A, "campaign_recipients", recipient.id);
    expect(row?.marked_sent_at).toBeNull();
    expect((await firstCampaign()).marked_sent_count).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* c. Derived counts                                                   */
/* ------------------------------------------------------------------ */

describe("CRM actions — derived counts", () => {
  it("markRecipientSentAction raises marked_sent_count by exactly 1 and moves updated_at", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientSentAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);
    expect(campaign.marked_sent_count).toBe(0);
    expect(campaign.updated_at).toBe(AS_OF);

    vi.setSystemTime(new Date(LATER));
    const result = await markRecipientSentAction(recipient.id, "Sent from the phone");

    expect(result).toEqual({
      ok: true,
      message: "Recorded as sent. OrderBook did not send anything — you told us it happened.",
    });
    const after = (await firstCampaign()).marked_sent_count;
    expect(after).toBe(1);
    const stored = (await storedRows(BRAND_A, "campaign_recipients"))[0];
    expect(stored.marked_sent_at).toBe(LATER);
    expect(stored.status).toBe("marked_sent");
    // The campaign stamp is the same pinned instant the recipient was written.
    expect((await firstCampaign()).updated_at).toBe(LATER);
  });

  it("recording the same recipient twice says so and does not double-count", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientSentAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);
    expect((await markRecipientSentAction(recipient.id)).ok).toBe(true);

    vi.setSystemTime(new Date(LATER));
    const again = await markRecipientSentAction(recipient.id);

    // The message names the moment it WAS recorded (the first call), not now.
    expect(again).toEqual({
      ok: true,
      message: `Already recorded as sent on ${AS_OF.slice(0, 16)}. Nothing was rewritten.`,
    });
    const row = (await storedRows(BRAND_A, "campaign_recipients"))[0];
    expect(row.marked_sent_at).toBe(AS_OF);
    expect(row.updated_at).toBe(AS_OF);
    const stored = await firstCampaign();
    expect(stored.marked_sent_count).toBe(1);
    expect(stored.updated_at).toBe(AS_OF);
  });

  it("attributes revenue only from the order the redemption points at", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientRedeemedAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);

    const result = await markRecipientRedeemedAction(recipient.id, "o-mine");

    expect(result.ok).toBe(true);
    const stored = await firstCampaign();
    expect(stored.redemption_count).toBe(1);
    // 500 is the order's own grand_total, not a number anyone typed.
    expect(stored.revenue_attributed).toBe(500);
    expect(stored.targeted_count).toBe(1);
    expect(stored.marked_sent_count).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* d. Foreign references are refused                                   */
/* ------------------------------------------------------------------ */

describe("CRM actions — foreign references", () => {
  it("markRecipientRedeemedAction refuses an order that is not this brand's", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientRedeemedAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaign = await firstCampaign();
    const recipient = await onlyRecipient(campaign.id);

    const result = await markRecipientRedeemedAction(recipient.id, "o-theirs");

    expect(result).toEqual({ ok: false, message: "Pick a valid order." });
    const row = (await storedRows(BRAND_A, "campaign_recipients"))[0];
    expect(row.redeemed_at).toBeNull();
    expect(row.order_id).toBeNull();
    expect((await firstCampaign()).revenue_attributed).toBe(0);
  });

  it("saveSegmentAction refuses a manual customer id that is not this brand's customer", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveSegmentAction } = await import("@/services/crm-segment-actions");

    const result = await saveSegmentAction(
      segmentInput({ manual_customer_ids: ["c-granted", "c-foreign"] }),
    );

    expect(result).toEqual({
      ok: false,
      message:
        "One of the selected customers does not belong to this brand. Refresh the list and pick again.",
    });
    expect(await storedRows(BRAND_A, "customer_segments")).toEqual([]);
  });

  it("refuses an audience or offer id that belongs to another brand", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    expect(await saveCampaignAction(campaignInput({ segment_id: "segment-of-another-brand" }))).toEqual(
      { ok: false, message: "Pick a valid segment." },
    );
    expect(await saveCampaignAction(campaignInput({ offer_id: "offer-of-another-brand" }))).toEqual(
      { ok: false, message: "Pick a valid offer." },
    );
    expect(await storedRows(BRAND_A, "marketing_campaigns")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* e. Brand tenancy                                                    */
/* ------------------------------------------------------------------ */

describe("CRM actions — brand tenancy", () => {
  it("brand B does not see brand A's rows through the same action layer", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction, markRecipientSentAction } = await import(
      "@/services/crm-campaign-actions"
    );

    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaignA = await firstCampaign();
    const recipientA = await onlyRecipient(campaignA.id);

    await signIn(sessionFor(BRAND_B, CODE_B, "owner"));
    expect(await storedRows(BRAND_B, "marketing_campaigns", CODE_B)).toEqual([]);
    expect(await storedRows(BRAND_B, "campaign_recipients", CODE_B)).toEqual([]);

    const result = await markRecipientSentAction(recipientA.id);
    expect(result).toEqual({ ok: false, message: "Recipient not found." });

    const row = (await storedRows(BRAND_A, "campaign_recipients"))[0];
    expect(row.marked_sent_at).toBeNull();
    expect((await firstCampaign()).marked_sent_count).toBe(0);
  });

  it("refuses a campaign id that belongs to another brand, through the message channel", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");
    expect((await saveCampaignAction(campaignInput())).ok).toBe(true);
    const campaignA = await firstCampaign();

    await signIn(sessionFor(BRAND_B, CODE_B, "owner"));
    // An id the client cannot own must be refused before the write, not thrown
    // by the repository — `{ ok: false, message }` is the only failure channel.
    await expect(
      saveCampaignAction(
        campaignInput({ id: campaignA.id, name: "Hijacked" }),
      ),
    ).resolves.toEqual({
      ok: false,
      message:
        "That campaign does not belong to this workspace. Refresh the list and try again.",
    });

    expect((await firstCampaign()).name).toBe("Summer offer");
    expect(await storedRows(BRAND_B, "marketing_campaigns", CODE_B)).toEqual([]);
  });

  it("still edits a campaign whose id this workspace owns", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");
    const created = await saveCampaignAction(campaignInput());
    expect(created.ok).toBe(true);
    const campaignA = await firstCampaign();

    const edited = await saveCampaignAction(
      campaignInput({ id: campaignA.id, name: "Renamed" }),
    );
    expect(edited.ok).toBe(true);
    expect(await firstCampaign()).toMatchObject({ id: campaignA.id, name: "Renamed" });
    // Editing is not a re-create: one row, not two.
    expect(await storedRows(BRAND_A, "marketing_campaigns")).toHaveLength(1);
  });

  it("brand B's campaign audience is built from brand B's customers only", async () => {
    await signIn(sessionFor(BRAND_B, CODE_B, "owner"));
    const { saveCampaignAction } = await import("@/services/crm-campaign-actions");

    expect((await saveCampaignAction(campaignInput({ name: "B-only" }))).ok).toBe(true);

    const campaign = await firstCampaign(BRAND_B, CODE_B);
    const rows = (await storedRows(BRAND_B, "campaign_recipients", CODE_B)).filter(
      (r) => r.campaign_id === campaign.id,
    );
    // Brand B has exactly one customer and it has granted consent.
    expect(rows.map((r) => r.customer_id)).toEqual(["c-foreign"]);
    expect(campaign.targeted_count).toBe(1);
  });

  it("gives each brand its own loyalty settings row instead of colliding on one key", async () => {
    const { saveLoyaltySettingsAction } = await import("@/services/crm-loyalty-actions");

    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    expect(
      await saveLoyaltySettingsAction({
        enabled: true,
        earn_points_per_unit: 1,
        redeem_value_per_point: 0.5,
        expiry_days: 365,
      }),
    ).toEqual({ ok: true, message: "Loyalty configuration saved." });

    // The settings row's id doubles as its primary key. While it was a fixed
    // string, this second brand's save hit `CsvCrmRepository.save`'s brand check
    // and threw out of an action that has no throw channel.
    await signIn(sessionFor(BRAND_B, CODE_B, "owner"));
    expect(
      await saveLoyaltySettingsAction({
        enabled: false,
        earn_points_per_unit: 2,
        redeem_value_per_point: 0,
      }),
    ).toEqual({ ok: true, message: "Loyalty configuration saved." });

    const [settingsA] = await storedRows(BRAND_A, "crm_settings");
    const [settingsB] = await storedRows(BRAND_B, "crm_settings", CODE_B);
    expect(settingsA.brand_id).toBe(BRAND_A);
    expect(settingsB.brand_id).toBe(BRAND_B);
    expect(settingsA.id).not.toBe(settingsB.id);
    expect(settingsA.loyalty).toMatchObject({
      enabled: true,
      earn_points_per_unit: 1,
      redeem_value_per_point: 0.5,
      expiry_days: 365,
    });
    expect(settingsB.loyalty).toMatchObject({
      enabled: false,
      earn_points_per_unit: 2,
      redeem_value_per_point: 0,
    });
  });

  it("re-saving the same brand overwrites its one settings row rather than adding a second", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveLoyaltySettingsAction } = await import("@/services/crm-loyalty-actions");

    expect(
      (await saveLoyaltySettingsAction({ earn_points_per_unit: 1, redeem_value_per_point: 0 })).ok,
    ).toBe(true);
    const first = await storedRows(BRAND_A, "crm_settings");

    expect(
      (await saveLoyaltySettingsAction({ earn_points_per_unit: 5, redeem_value_per_point: 0 })).ok,
    ).toBe(true);
    const second = await storedRows(BRAND_A, "crm_settings");

    expect(second).toHaveLength(first.length);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].loyalty.earn_points_per_unit).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* Audit + revalidation plumbing                                       */
/* ------------------------------------------------------------------ */

describe("CRM actions — audit and revalidation", () => {
  /** The audit trail is a table now, so an entry is read back like any row. */
  async function auditRows(brandId: string): Promise<AuditLogEntry[]> {
    const { readBrandRows } = await import("@/lib/csv/store");
    return readBrandRows("audit_log", brandId) as unknown as AuditLogEntry[];
  }

  it("records one audit row for the brand that wrote, and revalidates the CRM paths", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveSegmentAction } = await import("@/services/crm-segment-actions");
    const { revalidatePath } = await import("next/cache");

    expect((await saveSegmentAction(segmentInput())).ok).toBe(true);

    const rows = await auditRows(BRAND_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand_id: BRAND_A,
      action: "crm.segment.created",
      entity_type: "crm_segment",
    });
    expect(rows[0].detail).toContain("1 live members");

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/customers/segments");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/customers", "layout");
  });

  it("keeps one brand's audit trail out of another brand's rows", async () => {
    await signIn(sessionFor(BRAND_A, CODE_A, "owner"));
    const { saveSegmentAction } = await import("@/services/crm-segment-actions");

    expect((await saveSegmentAction(segmentInput())).ok).toBe(true);

    expect(await auditRows(BRAND_A)).toHaveLength(1);
    expect(await auditRows(BRAND_B)).toHaveLength(0);
  });
});
