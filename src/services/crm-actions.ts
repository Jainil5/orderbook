"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { listDemoOrders } from "@/lib/demo/data";
import { mergeDemoCustomers, mergeDemoOffers } from "@/lib/demo/merge-entities";
import {
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { newOpsId } from "@/lib/manager/ops-shared";
import { rowsToCsv } from "@/lib/export/csv";
import { validateLeadInput, type LeadInput } from "@/lib/manager/leads";
import { validateTaskInput, type TaskInput } from "@/lib/manager/tasks";
import type { Customer } from "@/types/database";
import { LEAD_STAGES, type Lead, type Task } from "@/types/operations";
import type {
  CampaignChannel,
  CampaignStatus,
  ComplaintStatus,
  CustomerSegment,
  LoyaltyEntry,
  MarketingCampaign,
  Membership,
  MembershipStatus,
  ReviewStatus,
  SegmentRules,
} from "@/types/crm";
import {
  CAMPAIGN_STATUSES,
  COMPLAINT_STATUSES,
  MEMBERSHIP_STATUSES,
  REVIEW_STATUSES,
} from "@/types/crm";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import {
  audienceForSegment,
  validateCampaignInput,
  validateResultInput,
  type CampaignInput,
  type ResultInput,
} from "@/lib/crm/campaigns";
import {
  conversionCheck,
  convertedLeadPatch,
  customerFromLead,
  findConversionClash,
  type ConversionInput,
} from "@/lib/crm/conversion";
import { loadDemoCrm, mergeCrm } from "@/lib/crm/data";
import {
  CUSTOMER_CSV_HEADERS,
  customersToCsvRows,
  findImportTarget,
  parseCustomerCsv,
  validateCustomerCrmInput,
  type CustomerCrmInput,
  type CustomerCrmValues,
} from "@/lib/crm/directory";
import { buildCustomerProfiles, type ProfileSource } from "@/lib/crm/metrics";
import {
  taskDraftFromInteraction,
  validateInteractionInput,
  type InteractionInput,
} from "@/lib/crm/interactions";
import {
  checkRedemption,
  validateGrantInput,
  validateLoyaltyRulesInput,
  validateMembershipInput,
  type GrantInput,
  type LoyaltyRulesInput,
  type MembershipInput,
} from "@/lib/crm/loyalty";
import {
  validateComplaintInput,
  validateReviewInput,
  validateReviewResponse,
  type ComplaintInput,
  type ReviewInput,
} from "@/lib/crm/reviews";
import { segmentRulesFromInput, type SegmentRuleInput } from "@/lib/crm/segments";

/**
 * CRM writes.
 *
 * Every other module treats the demo dataset as a showcase you may reshape but
 * never extend. The CRM is the documented exception: interactions, reviews,
 * complaints, segments, campaigns, loyalty entries and converted enquiries are
 * creatable, and they land in the same per-browser mutable store an edit
 * already uses — the seeded CSVs stay byte-for-byte what the showcase stats
 * assert. Two rules hold everywhere below: `brand_id` comes from the pack and
 * never from the form, and every foreign key is checked against the merged
 * rows the server reads, not against what the browser claims.
 */

type ActionError = { ok: false; message: string };

async function guardCrm(): Promise<{ ok: true; code: DemoBrandCode } | ActionError> {
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ?? "BR-1";
  return { ok: true, code };
}

async function knownIds(code: DemoBrandCode) {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const crm = mergeCrm(pack, bucket);
  const ops = mergeOperations(pack, bucket);
  const staff = await listDemoStaff(code);
  const orders = await listDemoOrders(undefined, code);
  return {
    brandId: pack.settings.brand_id,
    customerIds: mergeDemoCustomers(pack.customers, bucket).map((c) => c.id),
    orderIds: orders.map((o) => o.id),
    staffIds: staff.map((s) => s.id),
    leadIds: ops.leads.map((l) => l.id),
    reviewIds: crm.reviews.map((r) => r.id),
    interactionIds: crm.interactions.map((i) => i.id),
    segmentIds: crm.segments.map((s) => s.id),
    offerIds: mergeDemoOffers(pack.offers, bucket).map((o) => o.id),
    tierIds: crm.loyaltyRules?.tiers.map((t) => t.id) ?? [],
  };
}

/** The rollups the pages render, rebuilt from the same merged rows. */
async function profileSource(code: DemoBrandCode): Promise<ProfileSource> {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const crm = mergeCrm(pack, bucket);
  return {
    customers: mergeDemoCustomers(pack.customers, bucket),
    orders: await listDemoOrders(undefined, code),
    reviews: crm.reviews,
    complaints: crm.complaints,
    loyaltyLedger: crm.loyaltyLedger,
    loyaltyRules: crm.loyaltyRules,
    memberships: crm.memberships,
  };
}

type CrmListKey =
  | "interactions"
  | "reviews"
  | "complaints"
  | "segments"
  | "campaigns"
  | "memberships";

const OVERRIDE_KEYS = {
  interactions: "interactionOverrides",
  reviews: "reviewOverrides",
  complaints: "complaintOverrides",
  segments: "segmentOverrides",
  campaigns: "campaignOverrides",
  memberships: "membershipOverrides",
} as const satisfies Record<CrmListKey, keyof DemoMutableBucket>;

const LIST_ROUTES = {
  interactions: "/customers/interactions",
  reviews: "/customers/reviews",
  complaints: "/customers/reviews",
  segments: "/customers/segments",
  campaigns: "/customers/campaigns",
  memberships: "/customers/loyalty",
} as const satisfies Record<CrmListKey, string>;

async function addCrmEntity(
  code: DemoBrandCode,
  list: CrmListKey,
  entity: Record<string, unknown>,
) {
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    [list]: [...bucket[list], entity],
  }) as DemoMutableBucket);
}

async function patchCrm(
  code: DemoBrandCode,
  list: CrmListKey,
  id: string,
  patch: Record<string, unknown>,
) {
  const key = OVERRIDE_KEYS[list];
  await updateDemoMutableBucket(code, (bucket) => {
    const overrides = bucket[key] as Record<string, Record<string, unknown>>;
    return {
      ...bucket,
      [key]: { ...overrides, [id]: { ...(overrides[id] ?? {}), ...patch } },
    } as DemoMutableBucket;
  });
}

/** Existence guard: a stale row in another tab must not fake a success. */
async function hasCrmRecord(code: DemoBrandCode, list: CrmListKey, id: string) {
  const crm = await loadDemoCrm(code);
  return (crm[list] as { id: string }[]).some((entity) => entity.id === id);
}

async function deleteCrm(code: DemoBrandCode, list: CrmListKey, id: string, label: string) {
  if (!(await hasCrmRecord(code, list, id))) {
    return { ok: false, message: `${label} not found.` } as const;
  }
  await patchCrm(code, list, id, { deleted: true });
  revalidateCrm(LIST_ROUTES[list]);
  return { ok: true } as const;
}

function revalidateCrm(path: string, customerId?: string | null) {
  revalidatePath("/customers");
  revalidatePath("/customers/directory");
  revalidatePath(path);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

export async function saveInteractionAction(id: string | null, input: InteractionInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateInteractionInput(input, ids);
  if (!parsed.ok) return parsed;
  if (id) {
    if (!(await hasCrmRecord(guard.code, "interactions", id))) {
      return { ok: false, message: "Interaction not found." } as const;
    }
    await patchCrm(guard.code, "interactions", id, parsed.value);
  } else {
    await addCrmEntity(guard.code, "interactions", {
      id: newOpsId("int"),
      brand_id: ids.brandId,
      task_id: null,
      ...parsed.value,
    });
  }
  revalidateCrm("/customers/interactions", parsed.value.customer_id);
  return { ok: true } as const;
}

export async function deleteInteractionAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "interactions", id, "Interaction");
}

/** Closing a follow-up clears the date and records the outcome on the log. */
export async function completeFollowUpAction(id: string, outcome: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const crm = await loadDemoCrm(guard.code);
  const interaction = crm.interactions.find((i) => i.id === id);
  if (!interaction) return { ok: false, message: "Interaction not found." } as const;
  if (!interaction.next_follow_up_at) {
    return { ok: false, message: "That interaction has no open follow-up." } as const;
  }
  const text = outcome.trim().slice(0, 160);
  await patchCrm(guard.code, "interactions", id, {
    next_follow_up_at: null,
    outcome: text || interaction.outcome,
  });
  // The task it became, if any, closes with it. Editing a task is allowed in
  // the demo — this only ever moves a row that already exists.
  if (interaction.task_id) {
    const ops = mergeOperations(
      getDemoBrandPack(guard.code),
      await readDemoMutableBucket(guard.code),
    );
    if (ops.tasks.some((t) => t.id === interaction.task_id)) {
      await updateDemoMutableBucket(guard.code, (bucket) => ({
        ...bucket,
        taskOverrides: {
          ...bucket.taskOverrides,
          [interaction.task_id!]: {
            ...(bucket.taskOverrides[interaction.task_id!] ?? {}),
            status: "done",
          },
        },
      }));
      revalidatePath("/manager/tasks");
    }
  }
  revalidateCrm("/customers/interactions", interaction.customer_id);
  return { ok: true } as const;
}

/**
 * A follow-up hands over to the Productivity Manager by becoming a task in the
 * existing task store — the board the team already works its day from. The
 * `task_id` back-reference is what stops a second press making a second task.
 */
export async function createTaskFromInteractionAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const crm = await loadDemoCrm(guard.code);
  const interaction = crm.interactions.find((i) => i.id === id);
  if (!interaction) return { ok: false, message: "Interaction not found." } as const;
  if (interaction.task_id) {
    return { ok: false, message: "That follow-up is already a task." } as const;
  }
  const ids = await knownIds(guard.code);
  const draft = taskDraftFromInteraction(interaction);
  const parsed = validateTaskInput(
    {
      title: draft.title,
      description: draft.description,
      assigneeStaffId: draft.assigneeStaffId ?? undefined,
      customerId: draft.customerId ?? undefined,
      priority: draft.priority,
      dueAt: draft.dueAt ?? "",
    } satisfies TaskInput,
    ids,
  );
  if (!parsed.ok) return parsed;
  const task: Task = {
    id: newOpsId("task"),
    brand_id: ids.brandId,
    status: "open",
    ...parsed.value,
  };
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    tasks: [...bucket.tasks, task],
  }));
  await patchCrm(guard.code, "interactions", id, { task_id: task.id });
  revalidatePath("/manager");
  revalidatePath("/manager/tasks");
  revalidateCrm("/customers/interactions", interaction.customer_id);
  return { ok: true, taskId: task.id } as const;
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export async function saveReviewAction(id: string | null, input: ReviewInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateReviewInput(input, ids);
  if (!parsed.ok) return parsed;
  if (id) {
    if (!(await hasCrmRecord(guard.code, "reviews", id))) {
      return { ok: false, message: "Review not found." } as const;
    }
    await patchCrm(guard.code, "reviews", id, parsed.value);
  } else {
    await addCrmEntity(guard.code, "reviews", {
      id: newOpsId("rev"),
      brand_id: ids.brandId,
      response_text: null,
      responded_at: null,
      status: "new",
      complaint_id: null,
      ...parsed.value,
    });
  }
  revalidateCrm("/customers/reviews", parsed.value.customer_id);
  return { ok: true } as const;
}

export async function respondToReviewAction(id: string, text: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const parsed = validateReviewResponse(text);
  if (!parsed.ok) return parsed;
  const crm = await loadDemoCrm(guard.code);
  const review = crm.reviews.find((r) => r.id === id);
  if (!review) return { ok: false, message: "Review not found." } as const;
  await patchCrm(guard.code, "reviews", id, {
    response_text: parsed.value,
    responded_at: new Date().toISOString(),
    // Answering a fresh review acknowledges it; an escalated one stays escalated.
    status: review.status === "new" ? "acknowledged" : review.status,
  });
  revalidateCrm("/customers/reviews", review.customer_id);
  return { ok: true } as const;
}

export async function setReviewStatusAction(id: string, status: ReviewStatus) {
  if (!REVIEW_STATUSES.includes(status)) {
    return { ok: false, message: "Invalid review status." } as const;
  }
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  if (!(await hasCrmRecord(guard.code, "reviews", id))) {
    return { ok: false, message: "Review not found." } as const;
  }
  const crm = await loadDemoCrm(guard.code);
  const review = crm.reviews.find((r) => r.id === id)!;
  await patchCrm(guard.code, "reviews", id, { status });
  revalidateCrm("/customers/reviews", review.customer_id);
  return { ok: true } as const;
}

export async function deleteReviewAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "reviews", id, "Review");
}

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */

export async function saveComplaintAction(id: string | null, input: ComplaintInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateComplaintInput(input, ids);
  if (!parsed.ok) return parsed;
  // A complaint raised from a review or a call inherits that person, so the
  // 360 never shows a complaint nobody owns.
  const customerId =
    parsed.value.customer_id ??
    (parsed.value.review_id
      ? (await loadDemoCrm(guard.code)).reviews.find((r) => r.id === parsed.value.review_id)?.customer_id ??
        null
      : null);
  const complaintId = id ?? newOpsId("cmp");
  if (id) {
    if (!(await hasCrmRecord(guard.code, "complaints", id))) {
      return { ok: false, message: "Complaint not found." } as const;
    }
    await patchCrm(guard.code, "complaints", id, { ...parsed.value, customer_id: customerId });
  } else {
    await addCrmEntity(guard.code, "complaints", {
      id: complaintId,
      brand_id: ids.brandId,
      status: "open",
      resolved_at: null,
      ...parsed.value,
      customer_id: customerId,
    });
  }
  if (parsed.value.review_id) {
    await patchCrm(guard.code, "reviews", parsed.value.review_id, {
      status: "escalated",
      complaint_id: complaintId,
    });
  }
  revalidateCrm("/customers/reviews", customerId);
  return { ok: true, complaintId } as const;
}

export async function setComplaintStatusAction(id: string, status: ComplaintStatus) {
  if (!COMPLAINT_STATUSES.includes(status)) {
    return { ok: false, message: "Invalid complaint status." } as const;
  }
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const crm = await loadDemoCrm(guard.code);
  const complaint = crm.complaints.find((c) => c.id === id);
  if (!complaint) return { ok: false, message: "Complaint not found." } as const;
  await patchCrm(guard.code, "complaints", id, {
    status,
    resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
  });
  revalidateCrm("/customers/reviews", complaint.customer_id);
  return { ok: true } as const;
}

export async function deleteComplaintAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "complaints", id, "Complaint");
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

export type SegmentFormInput = {
  name: string;
  description: string;
  kind: string;
  member_ids: string[];
  rules: SegmentRuleInput;
};

export async function saveSegmentAction(id: string | null, input: SegmentFormInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, message: "Give the segment a name." } as const;
  if (input.kind !== "dynamic" && input.kind !== "manual") {
    return { ok: false, message: "Pick how the segment stays up to date." } as const;
  }
  const memberIds = [...new Set(input.member_ids)];
  if (memberIds.some((memberId) => !ids.customerIds.includes(memberId))) {
    return { ok: false, message: "Only listed customers can join a segment." } as const;
  }
  let rules: SegmentRules | null = null;
  if (input.kind === "dynamic") {
    const parsed = segmentRulesFromInput(input.rules);
    if (parsed.error) return { ok: false, message: parsed.error } as const;
    rules = parsed.rules;
  }
  const values = {
    name,
    description: input.description.trim().slice(0, 300),
    kind: input.kind,
    rules,
    // A dynamic segment recomputes membership, so it stores no list.
    member_ids: input.kind === "manual" ? memberIds : [],
  } satisfies Partial<CustomerSegment>;
  if (id) {
    if (!(await hasCrmRecord(guard.code, "segments", id))) {
      return { ok: false, message: "Segment not found." } as const;
    }
    await patchCrm(guard.code, "segments", id, values);
  } else {
    await addCrmEntity(guard.code, "segments", {
      id: newOpsId("seg"),
      brand_id: ids.brandId,
      created_at: new Date().toISOString(),
      ...values,
    });
  }
  revalidateCrm("/customers/segments");
  return { ok: true } as const;
}

export async function deleteSegmentAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "segments", id, "Segment");
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export async function saveCampaignAction(id: string | null, input: CampaignInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateCampaignInput(input, ids);
  if (!parsed.ok) return parsed;
  const now = new Date().toISOString();
  if (id) {
    if (!(await hasCrmRecord(guard.code, "campaigns", id))) {
      return { ok: false, message: "Campaign not found." } as const;
    }
    await patchCrm(guard.code, "campaigns", id, { ...parsed.value, updated_at: now });
  } else {
    const campaign: MarketingCampaign = {
      id: newOpsId("camp"),
      brand_id: ids.brandId,
      ...parsed.value,
      messages_sent: 0,
      delivered: 0,
      responded: 0,
      redeemed: 0,
      revenue_attributed: 0,
      // Nothing is wired up to send, so a new campaign starts unconnected.
      delivery: "not_connected",
      created_at: now,
      updated_at: now,
    };
    await addCrmEntity(guard.code, "campaigns", campaign);
  }
  revalidateCrm("/customers/campaigns");
  return { ok: true } as const;
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  if (!CAMPAIGN_STATUSES.includes(status)) {
    return { ok: false, message: "Invalid campaign status." } as const;
  }
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  if (!(await hasCrmRecord(guard.code, "campaigns", id))) {
    return { ok: false, message: "Campaign not found." } as const;
  }
  await patchCrm(guard.code, "campaigns", id, {
    status,
    updated_at: new Date().toISOString(),
  });
  revalidateCrm("/customers/campaigns");
  return { ok: true } as const;
}

/**
 * Logging what a campaign did. The cap on `messages_sent` is the audience the
 * campaign could legally reach right now, computed from live consent — not
 * whatever was typed into the box.
 */
export async function logCampaignResultAction(id: string, input: ResultInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const crm = await loadDemoCrm(guard.code);
  const campaign = crm.campaigns.find((c) => c.id === id);
  if (!campaign) return { ok: false, message: "Campaign not found." } as const;
  const profiles = buildCustomerProfiles(await profileSource(guard.code));
  const segment = crm.segments.find((s) => s.id === campaign.segment_id) ?? null;
  const audience = audienceForSegment(segment, profiles, {
    consentRequired: campaign.consent_required,
    channel: campaign.channel as CampaignChannel,
  });
  const parsed = validateResultInput(input, audience.recipients.length);
  if (!parsed.ok) return parsed;
  await patchCrm(guard.code, "campaigns", id, {
    ...parsed.value,
    updated_at: new Date().toISOString(),
  });
  revalidateCrm("/customers/campaigns");
  return { ok: true, audienceSize: audience.recipients.length } as const;
}

export async function deleteCampaignAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "campaigns", id, "Campaign");
}

/* ------------------------------------------------------------------ */
/* Loyalty & memberships                                               */
/* ------------------------------------------------------------------ */

export async function grantLoyaltyPointsAction(input: GrantInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const crm = await loadDemoCrm(guard.code);
  const parsed = validateGrantInput(input, {
    rules: crm.loyaltyRules,
    customerIds: ids.customerIds,
    orderIds: ids.orderIds,
  });
  if (!parsed.ok) return parsed;
  const entry: LoyaltyEntry = {
    id: newOpsId("ly"),
    brand_id: ids.brandId,
    created_at: new Date().toISOString(),
    ...parsed.value,
  };
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    loyaltyLedger: [...bucket.loyaltyLedger, entry],
  }));
  revalidateCrm("/customers/loyalty", entry.customer_id);
  return { ok: true, points: entry.points } as const;
}

export async function redeemLoyaltyPointsAction(input: {
  customer_id: string;
  points: string;
  reason: string;
}) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const customerId = input.customer_id.trim();
  const ids = await knownIds(guard.code);
  if (!ids.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." } as const;
  }
  const crm = await loadDemoCrm(guard.code);
  const check = checkRedemption({
    rules: crm.loyaltyRules,
    entries: crm.loyaltyLedger.filter((e) => e.customer_id === customerId),
    points: Number(input.points),
    now: new Date(),
  });
  if (!check.ok) return check;
  const entry: LoyaltyEntry = {
    id: newOpsId("ly"),
    brand_id: ids.brandId,
    customer_id: customerId,
    kind: "redeem",
    // Signed by the rule the check just applied, never by the typed string.
    points: -Math.trunc(Number(input.points)),
    reason: input.reason.trim().slice(0, 200) || "Redeemed at the counter",
    order_id: null,
    expires_at: null,
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    loyaltyLedger: [...bucket.loyaltyLedger, entry],
  }));
  revalidateCrm("/customers/loyalty", customerId);
  return { ok: true, worth: check.worth } as const;
}

export async function saveLoyaltyRulesAction(input: LoyaltyRulesInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const parsed = validateLoyaltyRulesInput(input);
  if (!parsed.ok) return parsed;
  const crm = await loadDemoCrm(guard.code);
  const kept = new Set(parsed.value.tiers.map((t) => t.id));
  const abandoned = crm.memberships.filter((m) => !kept.has(m.tier_id));
  if (abandoned.length) {
    return {
      ok: false,
      message:
        abandoned.length === 1
          ? "A member still sits on a tier this edit removes — move them first."
          : `${abandoned.length} members still sit on a tier this edit removes — move them first.`,
    } as const;
  }
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    loyaltyRulesOverride: { ...bucket.loyaltyRulesOverride, ...parsed.value },
  }));
  revalidateCrm("/customers/loyalty");
  return { ok: true } as const;
}

export async function saveMembershipAction(id: string | null, input: MembershipInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateMembershipInput(input, {
    customerIds: ids.customerIds,
    tierIds: ids.tierIds,
  });
  if (!parsed.ok) return parsed;
  if (id) {
    if (!(await hasCrmRecord(guard.code, "memberships", id))) {
      return { ok: false, message: "Membership not found." } as const;
    }
    await patchCrm(guard.code, "memberships", id, parsed.value);
  } else {
    const membership: Membership = {
      id: newOpsId("mem"),
      brand_id: ids.brandId,
      ...parsed.value,
    };
    await addCrmEntity(guard.code, "memberships", membership);
  }
  revalidateCrm("/customers/loyalty", parsed.value.customer_id);
  return { ok: true } as const;
}

export async function setMembershipStatusAction(id: string, status: MembershipStatus) {
  if (!MEMBERSHIP_STATUSES.includes(status)) {
    return { ok: false, message: "Invalid membership status." } as const;
  }
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const crm = await loadDemoCrm(guard.code);
  const membership = crm.memberships.find((m) => m.id === id);
  if (!membership) return { ok: false, message: "Membership not found." } as const;
  await patchCrm(guard.code, "memberships", id, { status });
  revalidateCrm("/customers/loyalty", membership.customer_id);
  return { ok: true } as const;
}

export async function deleteMembershipAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  return deleteCrm(guard.code, "memberships", id, "Membership");
}

/* ------------------------------------------------------------------ */
/* Customers: CRM fields and CSV import                                */
/* ------------------------------------------------------------------ */

export async function updateCustomerCrmAction(customerId: string, input: CustomerCrmInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const parsed = validateCustomerCrmInput(input);
  if (!parsed.ok) return parsed;
  const pack = getDemoBrandPack(guard.code);
  const bucket = await readDemoMutableBucket(guard.code);
  const existing = mergeDemoCustomers(pack.customers, bucket).find((c) => c.id === customerId);
  if (!existing) return { ok: false, message: "Customer not found." } as const;
  await updateDemoMutableBucket(guard.code, (b) => ({
    ...b,
    customerOverrides: {
      ...b.customerOverrides,
      [customerId]: { ...b.customerOverrides[customerId], ...(parsed.value as CustomerCrmValues) },
    },
  }));
  revalidateCrm("/customers/directory", customerId);
  return { ok: true } as const;
}

/**
 * Importing a list. A spreadsheet is a contact list, not a marketing
 * permission, so consent stays off unless the file says yes row by row, and a
 * row matching somebody already on file is reported rather than duplicated.
 */
export async function importCustomersCsvAction(text: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Paste the CSV contents first." } as const;
  const { rows, errors } = parseCustomerCsv(trimmed);
  if (!rows.length) {
    return { ok: false, message: errors.slice(0, 3).join(" ") || "Nothing to import." } as const;
  }
  const ids = await knownIds(guard.code);
  const profiles = buildCustomerProfiles(await profileSource(guard.code));
  const created: Customer[] = [];
  let matched = 0;
  for (const row of rows) {
    if (findImportTarget(row, profiles)) {
      matched += 1;
      continue;
    }
    created.push({
      id: newOpsId("cust"),
      brand_id: ids.brandId,
      ...row,
    });
  }
  if (created.length) {
    await updateDemoMutableBucket(guard.code, (bucket) => ({
      ...bucket,
      customers: [...bucket.customers, ...created],
    }));
  }
  revalidateCrm("/customers/directory");
  return {
    ok: true,
    created: created.length,
    matched,
    skipped: errors.length,
    problems: errors.slice(0, 8),
  } as const;
}

/**
 * The directory exports what the screen is measuring: the CRM columns, and
 * none of the money rollups, since those are recomputed from the bills.
 */
export async function exportCustomerDirectoryCsvAction() {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const profiles = buildCustomerProfiles(await profileSource(guard.code));
  return {
    ok: true as const,
    csv: rowsToCsv([...CUSTOMER_CSV_HEADERS], customersToCsvRows(profiles)),
    filename: "customers.csv",
  };
}

/* ------------------------------------------------------------------ */
/* Leads pipeline                                                      */
/* ------------------------------------------------------------------ */
async function mergedLead(code: DemoBrandCode, id: string): Promise<Lead | null> {
  const ops = mergeOperations(getDemoBrandPack(code), await readDemoMutableBucket(code));
  return ops.leads.find((l) => l.id === id) ?? null;
}

export async function saveCrmLeadAction(id: string | null, input: LeadInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const ids = await knownIds(guard.code);
  const parsed = validateLeadInput(input, ids);
  if (!parsed.ok) return parsed;
  if (id) {
    const lead = await mergedLead(guard.code, id);
    if (!lead) return { ok: false, message: "Lead not found." } as const;
    if (lead.converted_customer_id && parsed.value.stage !== "won") {
      return { ok: false, message: "That enquiry has already converted." } as const;
    }
    await updateDemoMutableBucket(guard.code, (bucket) => ({
      ...bucket,
      leadOverrides: {
        ...bucket.leadOverrides,
        [id]: { ...bucket.leadOverrides[id], ...parsed.value },
      },
    }));
    revalidateCrm("/customers/leads");
    return { ok: true } as const;
  }
  const lead: Lead = {
    id: newOpsId("lead"),
    brand_id: ids.brandId,
    quotation_number: null,
    converted_customer_id: null,
    converted_at: null,
    created_at: new Date().toISOString(),
    ...parsed.value,
  };
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    leads: [...bucket.leads, lead],
  }));
  revalidateCrm("/customers/leads");
  return { ok: true, leadId: lead.id } as const;
}

/** Kanban drag-and-drop lands here: one column at a time, board order intact. */
export async function moveCrmLeadStageAction(id: string, stage: string) {
  const to = LEAD_STAGES.find((s) => s === stage);
  if (!to) return { ok: false, message: "That is not a stage on this board." } as const;
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const lead = await mergedLead(guard.code, id);
  if (!lead) return { ok: false, message: "Lead not found." } as const;
  if (lead.converted_customer_id) {
    return { ok: false, message: "That enquiry has already converted." } as const;
  }
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    leadOverrides: {
      ...bucket.leadOverrides,
      [id]: { ...bucket.leadOverrides[id], stage: to },
    },
  }));
  revalidateCrm("/customers/leads");
  return { ok: true } as const;
}

export async function deleteCrmLeadAction(id: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const lead = await mergedLead(guard.code, id);
  if (!lead) return { ok: false, message: "Lead not found." } as const;
  if (lead.converted_customer_id) {
    return {
      ok: false,
      message: "That enquiry became a customer — the history stays on their record.",
    } as const;
  }
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    leadOverrides: { ...bucket.leadOverrides, [id]: { deleted: true } },
  }));
  revalidateCrm("/customers/leads");
  return { ok: true } as const;
}

/**
 * Turning an enquiry into a customer without losing it: the lead keeps its
 * stage and gains the link, the customer is created from what the enquiry
 * said, and every interaction logged against the lead stays reachable from the
 * 360. Nothing is deleted, so the board history survives the move.
 */
export async function convertLeadAction(id: string, input: ConversionInput) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const lead = await mergedLead(guard.code, id);
  if (!lead) return { ok: false, message: "Lead not found." } as const;
  const check = conversionCheck(lead);
  if (!check.ok) return { ok: false, message: check.message } as const;
  const ids = await knownIds(guard.code);
  const profiles = buildCustomerProfiles(await profileSource(guard.code));
  const clash = findConversionClash(lead, profiles);
  if (clash) {
    return {
      ok: false,
      message: `${clash.customer.name} is already on file with those details — attach the enquiry instead.`,
      customerId: clash.customer.id,
    } as const;
  }
  const now = new Date();
  const customerId = newOpsId("cust");
  const customer = customerFromLead(lead, input, { brandId: ids.brandId, id: customerId, now });
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    customers: [customer, ...bucket.customers],
    leadOverrides: {
      ...bucket.leadOverrides,
      [id]: { ...bucket.leadOverrides[id], ...convertedLeadPatch(customerId, now) },
    },
  }));
  revalidateCrm("/customers/leads", customerId);
  revalidatePath("/manager/leads");
  return { ok: true, customerId } as const;
}

/** The other half of a clash: attach the enquiry to the customer on file. */
export async function attachLeadToCustomerAction(id: string, customerId: string) {
  const guard = await guardCrm();
  if (!guard.ok) return guard;
  const lead = await mergedLead(guard.code, id);
  if (!lead) return { ok: false, message: "Lead not found." } as const;
  const profiles = buildCustomerProfiles(await profileSource(guard.code));
  if (!profiles.some((p) => p.customer.id === customerId)) {
    return { ok: false, message: "Customer not found." } as const;
  }
  if (lead.converted_customer_id) {
    return { ok: false, message: "That enquiry is already linked." } as const;
  }
  const now = new Date();
  await updateDemoMutableBucket(guard.code, (bucket) => ({
    ...bucket,
    leadOverrides: {
      ...bucket.leadOverrides,
      [id]: { ...bucket.leadOverrides[id], ...convertedLeadPatch(customerId, now) },
    },
  }));
  revalidateCrm("/customers/leads", customerId);
  return { ok: true } as const;
}
