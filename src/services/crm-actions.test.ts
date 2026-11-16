// The CRM writes go through the same per-browser mutable store an edit already
// uses, so every guard below is exercised exactly as the browser hits it —
// including the ones whose whole job is to refuse.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { mergeOperations } from "@/lib/demo/operations-data";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoCrm } from "@/lib/crm/data";
import { loyaltyBalance } from "@/lib/crm/loyalty";
import {
  EMPTY_CAMPAIGN_INPUT,
  EMPTY_RESULT_INPUT,
  type CampaignInput,
  type ResultInput,
} from "@/lib/crm/campaigns";
import { EMPTY_COMPLAINT_INPUT, EMPTY_REVIEW_INPUT, type ComplaintInput, type ReviewInput } from "@/lib/crm/reviews";
import { EMPTY_CONVERSION_INPUT, type ConversionInput } from "@/lib/crm/conversion";
import { EMPTY_GRANT_INPUT, EMPTY_MEMBERSHIP_INPUT, type GrantInput, type MembershipInput } from "@/lib/crm/loyalty";
import {
  EMPTY_INTERACTION_INPUT,
  type InteractionInput,
} from "@/lib/crm/interactions";
import {
  EMPTY_CUSTOMER_CRM_INPUT,
  type CustomerCrmInput,
} from "@/lib/crm/directory";
import { EMPTY_SEGMENT_RULE_INPUT, type SegmentRuleInput } from "@/lib/crm/segments";
import type { LeadInput } from "@/lib/manager/leads";
import {
  attachLeadToCustomerAction,
  completeFollowUpAction,
  convertLeadAction,
  createTaskFromInteractionAction,
  deleteCampaignAction,
  deleteComplaintAction,
  deleteCrmLeadAction,
  deleteInteractionAction,
  deleteMembershipAction,
  deleteReviewAction,
  deleteSegmentAction,
  grantLoyaltyPointsAction,
  importCustomersCsvAction,
  logCampaignResultAction,
  moveCrmLeadStageAction,
  redeemLoyaltyPointsAction,
  respondToReviewAction,
  saveCampaignAction,
  saveComplaintAction,
  saveCrmLeadAction,
  saveInteractionAction,
  saveLoyaltyRulesAction,
  saveMembershipAction,
  saveReviewAction,
  saveSegmentAction,
  setCampaignStatusAction,
  setComplaintStatusAction,
  setMembershipStatusAction,
  setReviewStatusAction,
  updateCustomerCrmAction,
} from "./crm-actions";

const BRAND_ID = getDemoBrandPack("BR-1").settings.brand_id;

const crm = () => loadDemoCrm("BR-1");
const ops = async () => mergeOperations(getDemoBrandPack("BR-1"), await readDemoMutableBucket("BR-1"));
const bucket = () => readDemoMutableBucket("BR-1");

const interaction = (over: Partial<InteractionInput> = {}): InteractionInput => ({
  ...EMPTY_INTERACTION_INPUT,
  customer_id: "c2",
  type: "call",
  summary: "Chased the deposit for the Friday booking",
  staff_id: "bc-staff-1",
  ...over,
});

const review = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  ...EMPTY_REVIEW_INPUT,
  customer_id: "c2",
  source: "Google Business Profile",
  rating: "4",
  text: "Loved the new seasonal board, service was quick.",
  ...over,
});

const complaint = (over: Partial<ComplaintInput> = {}): ComplaintInput => ({
  ...EMPTY_COMPLAINT_INPUT,
  subject: "Order collected by the wrong person",
  severity: "high",
  owner_staff_id: "bc-staff-1",
  ...over,
});

const campaign = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  ...EMPTY_CAMPAIGN_INPUT,
  name: "Slow Tuesday top-up",
  type: "offer",
  channel: "whatsapp",
  segment_id: "bc-seg-1",
  offer_id: "of2",
  starts_at: "2026-12-01",
  ends_at: "2026-12-08",
  status: "draft",
  ...over,
});

const result = (over: Partial<ResultInput> = {}): ResultInput => ({
  ...EMPTY_RESULT_INPUT,
  ...over,
});

const grant = (over: Partial<GrantInput> = {}): GrantInput => ({
  ...EMPTY_GRANT_INPUT,
  customer_id: "c2",
  kind: "bonus",
  points: "25",
  reason: "Loyalty for the second booking",
  ...over,
});

const membership = (over: Partial<MembershipInput> = {}): MembershipInput => ({
  ...EMPTY_MEMBERSHIP_INPUT,
  customer_id: "c3",
  tier_id: "bronze",
  started_at: "2026-11-11",
  expires_at: "2027-11-11",
  ...over,
});

const crmFields = (over: Partial<CustomerCrmInput> = {}): CustomerCrmInput => ({
  ...EMPTY_CUSTOMER_CRM_INPUT,
  ...over,
});

const segmentRules = (over: Partial<SegmentRuleInput> = {}): SegmentRuleInput => ({
  ...EMPTY_SEGMENT_RULE_INPUT,
  ...over,
});

const convert = (over: Partial<ConversionInput> = {}): ConversionInput => ({
  ...EMPTY_CONVERSION_INPUT,
  ...over,
});

const newLead = (over: Partial<LeadInput> = {}): LeadInput => ({
  contact_name: "Marina Bay Kitchen",
  phone: "+91 98111 22233",
  email: "hello@marinabay.example",
  source: "Walk-in",
  requirement: "Two group coffee setups for a product shoot",
  site_address: "Bandra West, Mumbai",
  stage: "new",
  estimated_value: "26000",
  owner_staff_id: "bc-staff-1",
  next_action_at: "",
  ...over,
});

beforeEach(() => {
  jar.map.clear();
});

/**
 * A campaign addressed to exactly one reachable person, which is what makes
 * the consent rules observable: the audience is either 1 or 0, never a number
 * the test has to recompute.
 */
async function singleRecipientCampaign(): Promise<string> {
  await saveSegmentAction(null, {
    name: "One table",
    description: "",
    kind: "manual",
    member_ids: ["c2"],
    rules: segmentRules(),
  });
  const segment = (await crm()).segments.at(-1)!;
  await saveCampaignAction(null, campaign({ name: "One table push", segment_id: segment.id }));
  return (await crm()).campaigns.at(-1)!.id;
}

/** The biggest send the server will admit to, read off its own refusal. */
async function sendCap(campaignId: string): Promise<number> {
  const refused = await logCampaignResultAction(campaignId, result({ messages_sent: "999999" }));
  expect(refused.ok).toBe(false);
  return Number(/cannot be more than (\d+)/.exec((refused as { message: string }).message)![1]);
}

describe("brand tenancy on every CRM write", () => {
  it("stamps the pack's brand on each new row", async () => {
    await saveInteractionAction(null, interaction());
    await saveReviewAction(null, review());
    await saveComplaintAction(null, complaint({ customer_id: "c5" }));
    await saveSegmentAction(null, {
      name: "Big spenders",
      description: "",
      kind: "manual",
      member_ids: ["c2"],
      rules: segmentRules(),
    });
    await saveCampaignAction(null, campaign());
    await grantLoyaltyPointsAction(grant());
    await saveMembershipAction(null, membership());
    await saveCrmLeadAction(null, newLead());

    const loaded = await crm();
    expect(loaded.interactions.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.reviews.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.complaints.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.segments.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.campaigns.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.loyaltyLedger.at(-1)!.brand_id).toBe(BRAND_ID);
    expect(loaded.memberships.at(-1)!.brand_id).toBe(BRAND_ID);
    expect((await ops()).leads.at(-1)!.brand_id).toBe(BRAND_ID);
  });

  it("keeps the seeded rows byte-for-byte and holds adds in the cookie", async () => {
    const seeded = await crm();
    await saveInteractionAction(null, interaction());
    const after = await crm();
    expect(after.interactions).toHaveLength(seeded.interactions.length + 1);
    expect((await bucket()).interactions).toHaveLength(1);
    expect(getDemoBrandPack("BR-1").interactions).toHaveLength(seeded.interactions.length);
  });
});

describe("interaction actions", () => {
  it("refuses a foreign key that is not on the server's list", async () => {
    expect(await saveInteractionAction(null, interaction({ customer_id: "ghost" }))).toEqual({
      ok: false,
      message: "Pick a customer from the list.",
    });
    expect(await saveInteractionAction(null, interaction({ staff_id: "ghost" }))).toEqual({
      ok: false,
      message: "Pick a colleague from the staff list.",
    });
    expect(await bucket()).toMatchObject({ interactions: [] });
  });

  it("refuses an edit of a row that no longer exists", async () => {
    expect(await saveInteractionAction("ghost-int", interaction())).toEqual({
      ok: false,
      message: "Interaction not found.",
    });
    expect(await bucket()).toMatchObject({ interactionOverrides: {} });
  });

  it("tombstones once: the second delete reports it gone", async () => {
    expect(await deleteInteractionAction("bc-int-1")).toEqual({ ok: true });
    expect(await deleteInteractionAction("bc-int-1")).toEqual({
      ok: false,
      message: "Interaction not found.",
    });
  });
});

describe("follow-ups into the Productivity Manager", () => {
  it("makes one task per follow-up, then refuses a second", async () => {
    const first = await createTaskFromInteractionAction("bc-int-2");
    expect(first.ok).toBe(true);
    const created = await ops();
    const task = created.tasks.find((t) => t.id === (first as { taskId: string }).taskId)!;
    expect(task).toMatchObject({ customerId: "c5", status: "open", priority: "medium" });
    expect(task.title).toContain("Follow up:");

    const loaded = await crm();
    expect(loaded.interactions.find((i) => i.id === "bc-int-2")!.task_id).toBe(task.id);
    expect(await createTaskFromInteractionAction("bc-int-2")).toEqual({
      ok: false,
      message: "That follow-up is already a task.",
    });
    expect((await ops()).tasks.filter((t) => t.title.includes("Follow up:"))).toHaveLength(1);
  });

  it("closes the task it handed over when the follow-up is completed", async () => {
    await createTaskFromInteractionAction("bc-int-2");
    expect(
      await completeFollowUpAction("bc-int-2", "The transfer landed on Friday morning"),
    ).toEqual({ ok: true });
    const loaded = await crm();
    const interactionRow = loaded.interactions.find((i) => i.id === "bc-int-2")!;
    expect(interactionRow.next_follow_up_at).toBeNull();
    expect(interactionRow.outcome).toBe("The transfer landed on Friday morning");
    const linked = (await ops()).tasks.find((t) => t.id === interactionRow.task_id)!;
    expect(linked.status).toBe("done");
  });

  it("refuses a follow-up that was never open, and one that is gone", async () => {
    expect(await completeFollowUpAction("bc-int-1", "done")).toEqual({
      ok: false,
      message: "That interaction has no open follow-up.",
    });
    expect(await completeFollowUpAction("ghost-int", "done")).toEqual({
      ok: false,
      message: "Interaction not found.",
    });
    expect(await createTaskFromInteractionAction("ghost-int")).toEqual({
      ok: false,
      message: "Interaction not found.",
    });
  });
});

describe("review actions", () => {
  it("derives sentiment rather than trusting the form", async () => {
    expect(await saveReviewAction(null, review({ source: "Yelp" }))).toEqual({
      ok: false,
      message: "Pick where the review came from.",
    });
    expect(await saveReviewAction(null, review({ rating: "7" }))).toEqual({
      ok: false,
      message: "Rate it in whole stars, 1 to 5.",
    });
    expect(await saveReviewAction(null, review({ text: "  " }))).toEqual({
      ok: false,
      message: "Paste what the customer said.",
    });
    await saveReviewAction(null, review({ rating: "1", text: "Cold, late and at the wrong gate." }));
    const row = (await crm()).reviews.at(-1)!;
    expect(row.sentiment).toBe("negative");
    expect(row.status).toBe("new");
  });

  it("acknowledges a fresh review but never un-escalates an escalated one", async () => {
    await saveReviewAction(null, review());
    const fresh = (await crm()).reviews.at(-1)!;
    expect(await respondToReviewAction(fresh.id, "Thank you — we have passed this to the team.")).toEqual(
      { ok: true },
    );
    expect((await crm()).reviews.find((r) => r.id === fresh.id)!.status).toBe("acknowledged");

    expect(await respondToReviewAction("bc-rev-1b", "Sorry — the rider has been corrected.")).toEqual(
      { ok: true },
    );
    expect((await crm()).reviews.find((r) => r.id === "bc-rev-1b")!.status).toBe("escalated");
  });

  it("checks the reply and the row before writing either", async () => {
    expect(await respondToReviewAction("bc-rev-1", "   ")).toEqual({
      ok: false,
      message: "Write the reply you want posted.",
    });
    expect(await respondToReviewAction("ghost-rev", "Thanks!")).toEqual({
      ok: false,
      message: "Review not found.",
    });
    expect(await setReviewStatusAction("bc-rev-1", "filed" as never)).toEqual({
      ok: false,
      message: "Invalid review status.",
    });
    expect(await setReviewStatusAction("ghost-rev", "closed")).toEqual({
      ok: false,
      message: "Review not found.",
    });
    expect(await bucket()).toMatchObject({ reviewOverrides: {} });
  });

  it("tombstones a known review and reports a stale one as gone", async () => {
    expect(await deleteReviewAction("bc-rev-1")).toEqual({ ok: true });
    expect(await deleteReviewAction("bc-rev-1")).toEqual({ ok: false, message: "Review not found." });
  });
});

describe("complaint actions", () => {
  it("inherits the customer from the review and escalates it", async () => {
    const created = await saveComplaintAction(
      null,
      complaint({ subject: "", review_id: "bc-rev-4" }),
    );
    // A complaint needs a subject; the review alone is not enough to pass.
    expect(created).toEqual({ ok: false, message: "Say what went wrong." });

    const raised = await saveComplaintAction(null, complaint({ review_id: "bc-rev-4" }));
    expect(raised.ok).toBe(true);
    const loaded = await crm();
    const row = loaded.complaints.find((c) => c.id === (raised as { complaintId: string }).complaintId)!;
    expect(row.customer_id).toBe(loaded.reviews.find((r) => r.id === "bc-rev-4")!.customer_id);
    expect(row.status).toBe("open");
    expect(loaded.reviews.find((r) => r.id === "bc-rev-4")).toMatchObject({
      status: "escalated",
      complaint_id: row.id,
    });
  });

  it("refuses a complaint nobody is tied to and a link that is not real", async () => {
    expect(await saveComplaintAction(null, complaint())).toEqual({
      ok: false,
      message: "Choose whose complaint this is.",
    });
    expect(await saveComplaintAction(null, complaint({ review_id: "ghost-rev" }))).toEqual({
      ok: false,
      message: "That review is not in the inbox.",
    });
    expect(await saveComplaintAction(null, complaint({ customer_id: "c5", severity: "urgent" }))).toEqual({
      ok: false,
      message: "Pick how serious this is.",
    });
    expect(await bucket()).toMatchObject({ complaints: [] });
  });

  it("stamps the resolution only on the statuses that end the case", async () => {
    expect(await setComplaintStatusAction("bc-cmp-2", "resolved")).toEqual({ ok: true });
    const resolved = (await crm()).complaints.find((c) => c.id === "bc-cmp-2")!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_at).not.toBeNull();

    expect(await setComplaintStatusAction("bc-cmp-2", "in_progress")).toEqual({ ok: true });
    expect((await crm()).complaints.find((c) => c.id === "bc-cmp-2")!.resolved_at).toBeNull();

    expect(await setComplaintStatusAction("bc-cmp-2", "snoozed" as never)).toEqual({
      ok: false,
      message: "Invalid complaint status.",
    });
    expect(await setComplaintStatusAction("ghost-cmp", "resolved")).toEqual({
      ok: false,
      message: "Complaint not found.",
    });
    expect(await deleteComplaintAction("ghost-cmp")).toEqual({
      ok: false,
      message: "Complaint not found.",
    });
  });
});

describe("segment actions", () => {
  it("stores a member list only for a manual segment", async () => {
    await saveSegmentAction(null, {
      name: "Lapsed regulars",
      description: "Three months without a visit",
      kind: "dynamic",
      member_ids: ["c2", "c3"],
      rules: segmentRules({ inactiveDays: "90" }),
    });
    let row = (await crm()).segments.at(-1)!;
    expect(row.rules).toEqual({ inactiveDays: 90 });
    expect(row.member_ids).toEqual([]);

    await saveSegmentAction(null, {
      name: "Birthday list",
      description: "",
      kind: "manual",
      member_ids: ["c2", "c2", "c3"],
      rules: segmentRules(),
    });
    row = (await crm()).segments.at(-1)!;
    expect(row.member_ids).toEqual(["c2", "c3"]);
    expect(row.rules).toBeNull();
  });

  it("refuses unnamed segments, strangers and stale rows", async () => {
    expect(
      await saveSegmentAction(null, { name: "  ", description: "", kind: "manual", member_ids: [], rules: segmentRules() }),
    ).toEqual({ ok: false, message: "Give the segment a name." });
    expect(
      await saveSegmentAction(null, {
        name: "Ghost members",
        description: "",
        kind: "manual",
        member_ids: ["ghost"],
        rules: segmentRules(),
      }),
    ).toEqual({ ok: false, message: "Only listed customers can join a segment." });
    expect(
      await saveSegmentAction(null, {
        name: "Wrong kind",
        description: "",
        kind: "vibes",
        member_ids: [],
        rules: segmentRules(),
      }),
    ).toEqual({ ok: false, message: "Pick how the segment stays up to date." });
    expect(
      await saveSegmentAction("ghost-seg", {
        name: "Stale",
        description: "",
        kind: "manual",
        member_ids: [],
        rules: segmentRules(),
      }),
    ).toEqual({ ok: false, message: "Segment not found." });
    expect(await bucket()).toMatchObject({ segments: [], segmentOverrides: {} });
  });

  it("tombstones a known segment once", async () => {
    expect(await deleteSegmentAction("bc-seg-1")).toEqual({ ok: true });
    expect(await deleteSegmentAction("bc-seg-1")).toEqual({ ok: false, message: "Segment not found." });
  });
});

describe("campaign actions", () => {
  it("starts a new campaign unconnected with every counter at zero", async () => {
    await saveCampaignAction(null, campaign());
    const row = (await crm()).campaigns.at(-1)!;
    expect(row).toMatchObject({
      delivery: "not_connected",
      messages_sent: 0,
      delivered: 0,
      responded: 0,
      redeemed: 0,
      revenue_attributed: 0,
      status: "draft",
    });
  });

  it("validates the plan and the links", async () => {
    expect(await saveCampaignAction(null, campaign({ name: "" }))).toEqual({
      ok: false,
      message: "Give the campaign a name.",
    });
    expect(await saveCampaignAction(null, campaign({ segment_id: "ghost-seg" }))).toEqual({
      ok: false,
      message: "Pick a saved segment, or leave it on everyone.",
    });
    expect(await saveCampaignAction(null, campaign({ offer_id: "ghost-offer" }))).toMatchObject({
      ok: false,
    });
    expect(await saveCampaignAction(null, campaign({ ends_at: "2026-11-30" }))).toEqual({
      ok: false,
      message: "The campaign cannot end before it starts.",
    });
    expect(await setCampaignStatusAction("ghost-camp", "active")).toEqual({
      ok: false,
      message: "Campaign not found.",
    });
    expect(await setCampaignStatusAction("bc-cam-1", "live" as never)).toEqual({
      ok: false,
      message: "Invalid campaign status.",
    });
    expect(await bucket()).toMatchObject({ campaigns: [], campaignOverrides: {} });
  });

  it("caps logged sends at the audience the campaign may legally reach", async () => {
    const campaignId = await singleRecipientCampaign();

    expect(await sendCap(campaignId)).toBe(1);
    expect(
      await logCampaignResultAction(campaignId, result({ messages_sent: "1", delivered: "2" })),
    ).toEqual({ ok: false, message: "Delivered cannot exceed the number you sent." });
    expect(
      await logCampaignResultAction(campaignId, result({ messages_sent: "1", responded: "2" })),
    ).toEqual({ ok: false, message: "Responses cannot exceed the number you sent." });
    expect(
      await logCampaignResultAction(
        campaignId,
        result({ messages_sent: "1", responded: "1", redeemed: "2" }),
      ),
    ).toEqual({ ok: false, message: "Redemptions cannot exceed the responses." });

    expect(
      await logCampaignResultAction(
        campaignId,
        result({ messages_sent: "1", delivered: "1", responded: "1", redeemed: "1", revenue_attributed: "900" }),
      ),
    ).toEqual({ ok: true, audienceSize: 1 });
    expect((await crm()).campaigns.find((c) => c.id === campaignId)!).toMatchObject({
      messages_sent: 1,
      delivered: 1,
      responded: 1,
      redeemed: 1,
      revenue_attributed: 900,
      delivery: "manual_log",
    });
  });

  it("refuses a result for a campaign that is not there", async () => {
    expect(await logCampaignResultAction("ghost-camp", result({ messages_sent: "1" }))).toEqual({
      ok: false,
      message: "Campaign not found.",
    });
    expect(await deleteCampaignAction("ghost-camp")).toEqual({
      ok: false,
      message: "Campaign not found.",
    });
    expect(await bucket()).toMatchObject({ campaignOverrides: {} });
  });
});

describe("loyalty actions", () => {
  it("signs the ledger entry by its kind, not by what was typed", async () => {
    await grantLoyaltyPointsAction(grant({ kind: "adjust", points: "-10" }));
    expect((await crm()).loyaltyLedger.at(-1)!.points).toBe(-10);

    await grantLoyaltyPointsAction(grant({ kind: "expire", points: "10" }));
    expect((await crm()).loyaltyLedger.at(-1)!.points).toBe(-10);

    await grantLoyaltyPointsAction(grant({ kind: "earn", points: "30" }));
    const earned = (await crm()).loyaltyLedger.at(-1)!;
    expect(earned.points).toBe(30);
    expect(earned.expires_at).not.toBeNull();

    expect(await grantLoyaltyPointsAction(grant({ customer_id: "ghost" }))).toEqual({
      ok: false,
      message: "Pick a customer from the list.",
    });
    expect(await grantLoyaltyPointsAction(grant({ order_id: "ghost-order" }))).toMatchObject({ ok: false });
    expect(await grantLoyaltyPointsAction(grant({ kind: "gift" }))).toEqual({
      ok: false,
      message: "Pick what kind of ledger entry this is.",
    });
  });

  it("refuses a redemption larger than the live balance", async () => {
    const loaded = await crm();
    const balance = loyaltyBalance(
      loaded.loyaltyLedger.filter((e) => e.customer_id === "c2"),
      new Date(),
    );
    const over = await redeemLoyaltyPointsAction({
      customer_id: "c2",
      points: String(balance + 1),
      reason: "Free filter",
    });
    expect(over).toEqual({ ok: false, message: `Only ${balance} points available — that redemption is too large.` });

    expect(await redeemLoyaltyPointsAction({ customer_id: "ghost", points: "1", reason: "" })).toEqual({
      ok: false,
      message: "Pick a customer from the list.",
    });

    const spent = await redeemLoyaltyPointsAction({ customer_id: "c2", points: String(balance), reason: "Full redemption" });
    expect(spent.ok).toBe(true);
    const entry = (await crm()).loyaltyLedger.at(-1)!;
    expect(entry).toMatchObject({ kind: "redeem", points: -balance, customer_id: "c2" });
    expect(
      loyaltyBalance((await crm()).loyaltyLedger.filter((e) => e.customer_id === "c2"), new Date()),
    ).toBe(0);
  });

  it("refuses to delete a tier members are still sitting on", async () => {
    const all = "Bronze, 0, 0\nSilver, 1200, 5\nGold, 2300, 10";
    const withoutGold = "Bronze, 0, 0\nSilver, 1200, 5";
    expect(
      await saveLoyaltyRulesAction({
        earn_mode: "per_amount",
        earn_amount_per_point: "20",
        earn_points_per_order: "0",
        point_value: "0.5",
        expiry_days: "365",
        redemption_enabled: "yes",
        tiers: withoutGold,
      }),
    ).toEqual({
      ok: false,
      message: "A member still sits on a tier this edit removes — move them first.",
    });

    expect(
      await saveLoyaltyRulesAction({
        earn_mode: "per_amount",
        earn_amount_per_point: "20",
        earn_points_per_order: "0",
        point_value: "0.5",
        expiry_days: "365",
        redemption_enabled: "yes",
        tiers: all,
      }),
    ).toEqual({ ok: true });
    expect((await crm()).loyaltyRules!.tiers.map((t) => t.id)).toEqual(["bronze", "silver", "gold"]);

    expect(
      await saveLoyaltyRulesAction({
        earn_mode: "per_amount",
        earn_amount_per_point: "20",
        earn_points_per_order: "0",
        point_value: "0",
        expiry_days: "365",
        redemption_enabled: "yes",
        tiers: all,
      }),
    ).toEqual({ ok: false, message: "A point needs a value above zero." });
  });

  it("keeps memberships on tiers that exist and closes them honestly", async () => {
    expect(await saveMembershipAction(null, membership({ tier_id: "platinum" }))).toMatchObject({
      ok: false,
    });
    expect(await saveMembershipAction(null, membership({ customer_id: "ghost" }))).toEqual({
      ok: false,
      message: "Pick a customer from the list.",
    });
    await saveMembershipAction(null, membership());
    const row = (await crm()).memberships.at(-1)!;
    expect(row).toMatchObject({ customer_id: "c3", tier_id: "bronze", status: "active" });

    expect(await setMembershipStatusAction(row.id, "expired")).toEqual({ ok: true });
    expect((await crm()).memberships.find((m) => m.id === row.id)!.status).toBe("expired");
    expect(await setMembershipStatusAction("ghost-mem", "active")).toEqual({
      ok: false,
      message: "Membership not found.",
    });
    expect(await setMembershipStatusAction("bc-mem-1", "vibrant" as never)).toEqual({
      ok: false,
      message: "Invalid membership status.",
    });
    expect(await deleteMembershipAction("ghost-mem")).toEqual({
      ok: false,
      message: "Membership not found.",
    });
    expect(await saveMembershipAction("ghost-mem", membership())).toEqual({
      ok: false,
      message: "Membership not found.",
    });
  });
});

describe("customer CRM fields and CSV import", () => {
  it("lets an explicit opt-out beat marketing consent", async () => {
    const campaignId = await singleRecipientCampaign();
    expect(await sendCap(campaignId)).toBe(1);

    expect(
      await updateCustomerCrmAction(
        "c2",
        crmFields({ marketing_consent: "yes", opted_out: "yes", tags: "loyal, tuesdays" }),
      ),
    ).toEqual({ ok: true });

    const row = mergeDemoCustomers(getDemoBrandPack("BR-1").customers, await bucket()).find(
      (c) => c.id === "c2",
    )!;
    expect(row).toMatchObject({ opted_out: true, tags: ["loyal", "tuesdays"] });
    // The consent flag is a fact the shopkeeper recorded; the opt-out is the
    // fact about the person, and it is what the audience is measured against.
    expect(row.marketing_consent).toBe(true);
    expect(await sendCap(campaignId)).toBe(0);
  });

  it("refuses an unknown customer and unreadable custom fields", async () => {
    expect(await updateCustomerCrmAction("ghost", crmFields())).toEqual({
      ok: false,
      message: "Customer not found.",
    });
    expect(
      await updateCustomerCrmAction("c2", crmFields({ custom_fields: "not json" })),
    ).toMatchObject({ ok: false });
    expect(await bucket()).toMatchObject({ customerOverrides: {} });
  });

  it("imports new people without inventing consent and without duplicating the ones on file", async () => {
    const csv = [
      "name,email,phone,marketing_consent",
      "Nisha Verma,nisha@example.com,+91 90000 77777,yes",
      "Gaurav Gupta,,+91 98674 84952,yes",
      "Rehan Sheikh,rehan@example.com,,",
      ",,,no",
    ].join("\n");
    const imported = await importCustomersCsvAction(csv);
    expect(imported).toMatchObject({ ok: true, created: 2, matched: 1, skipped: 1 });

    const customers = mergeDemoCustomers(getDemoBrandPack("BR-1").customers, await bucket());
    const nisha = customers.find((c) => c.email === "nisha@example.com")!;
    expect(nisha).toMatchObject({ marketing_consent: true, opted_out: false, brand_id: BRAND_ID });
    const rehan = customers.find((c) => c.email === "rehan@example.com")!;
    expect(rehan.marketing_consent).toBe(false);
    expect(customers.filter((c) => c.name === "Gaurav Gupta")).toHaveLength(1);
  });

  it("refuses an empty paste instead of reporting a zero-row success", async () => {
    expect(await importCustomersCsvAction("   ")).toEqual({
      ok: false,
      message: "Paste the CSV contents first.",
    });
    expect(await importCustomersCsvAction("name,email,phone")).toMatchObject({ ok: false });
    expect(await bucket()).toMatchObject({ customers: [] });
  });
});

describe("lead pipeline actions", () => {
  it("moves a lead one column and refuses a stage the board does not have", async () => {
    expect(await moveCrmLeadStageAction("bc-lead-2", "teleport")).toEqual({
      ok: false,
      message: "That is not a stage on this board.",
    });
    expect(await moveCrmLeadStageAction("ghost-lead", "won")).toEqual({
      ok: false,
      message: "Lead not found.",
    });
    expect(await moveCrmLeadStageAction("bc-lead-2", "quote_sent")).toEqual({ ok: true });
    expect((await ops()).leads.find((l) => l.id === "bc-lead-2")!.stage).toBe("quote_sent");
  });

  it("keeps a converted enquiry out of the board edits", async () => {
    const created = await saveCrmLeadAction(null, newLead());
    const leadId = (created as { leadId: string }).leadId;
    expect(await convertLeadAction(leadId, convert())).toMatchObject({ ok: true });

    expect(await moveCrmLeadStageAction(leadId, "new")).toEqual({
      ok: false,
      message: "That enquiry has already converted.",
    });
    expect(await saveCrmLeadAction(leadId, newLead({ stage: "lost" }))).toEqual({
      ok: false,
      message: "That enquiry has already converted.",
    });
    expect(await deleteCrmLeadAction(leadId)).toMatchObject({ ok: false });
    expect(await convertLeadAction(leadId, convert())).toMatchObject({ ok: false });
  });

  it("converts an enquiry into a customer and keeps the history reachable", async () => {
    const created = await saveCrmLeadAction(null, newLead());
    expect(created.ok).toBe(true);
    const leadId = (created as { leadId: string }).leadId;

    const converted = await convertLeadAction(leadId, convert({ marketing_consent: "yes", tags: "shoot" }));
    expect(converted.ok).toBe(true);
    const customerId = (converted as { customerId: string }).customerId;

    const customers = mergeDemoCustomers(getDemoBrandPack("BR-1").customers, await bucket());
    const customer = customers.find((c) => c.id === customerId)!;
    expect(customer).toMatchObject({
      name: "Marina Bay Kitchen",
      brand_id: BRAND_ID,
      marketing_consent: true,
      tags: ["shoot"],
    });
    expect(customer.notes).toContain("Converted from enquiry");

    const lead = (await ops()).leads.find((l) => l.id === leadId)!;
    expect(lead).toMatchObject({ stage: "won", converted_customer_id: customerId });
    expect(Date.parse(lead.created_at)).toBeLessThan(Date.parse(lead.converted_at!));
    expect(customer.created_at).toBe(lead.converted_at);

    expect(await convertLeadAction(leadId, convert())).toEqual({
      ok: false,
      message: "This enquiry is already a customer.",
    });
    expect(await deleteCrmLeadAction(leadId)).toMatchObject({ ok: false });
  });

  it("offers to attach an enquiry that is already on file instead of duplicating it", async () => {
    const created = await saveCrmLeadAction(null, newLead({ phone: "+91 98912 24454", email: "" }));
    const leadId = (created as { leadId: string }).leadId;

    const clash = await convertLeadAction(leadId, convert());
    expect(clash.ok).toBe(false);
    expect((clash as { message: string }).message).toContain("already on file");
    expect((await bucket()).customers).toHaveLength(0);

    const customerId = (clash as { customerId: string }).customerId;
    expect(await attachLeadToCustomerAction(leadId, customerId)).toEqual({ ok: true });
    const lead = (await ops()).leads.find((l) => l.id === leadId)!;
    expect(lead).toMatchObject({ stage: "won", converted_customer_id: customerId });
    expect(await attachLeadToCustomerAction(leadId, customerId)).toEqual({
      ok: false,
      message: "That enquiry is already linked.",
    });
    expect(await attachLeadToCustomerAction(leadId, "ghost")).toEqual({
      ok: false,
      message: "Customer not found.",
    });
    expect(await attachLeadToCustomerAction("ghost-lead", customerId)).toEqual({
      ok: false,
      message: "Lead not found.",
    });
  });

  it("refuses an enquiry with nothing quotable in it", async () => {
    expect(await saveCrmLeadAction(null, newLead({ contact_name: "  " }))).toEqual({
      ok: false,
      message: "A contact name is required.",
    });
    expect(await saveCrmLeadAction(null, newLead({ requirement: "" }))).toMatchObject({ ok: false });
    expect(await saveCrmLeadAction(null, newLead({ stage: "someday" }))).toMatchObject({ ok: false });
    expect(await bucket()).toMatchObject({ leads: [] });
  });

  it("tombstones an unconverted enquiry once", async () => {
    expect(await deleteCrmLeadAction("bc-lead-2")).toEqual({ ok: true });
    expect(await deleteCrmLeadAction("bc-lead-2")).toEqual({ ok: false, message: "Lead not found." });
  });
});
