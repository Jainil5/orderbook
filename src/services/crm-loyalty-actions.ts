"use server";

import {
  flag,
  money,
  oneOf,
  refId,
  text,
  type Validated,
} from "@/lib/business/validate";
import {
  auditCrm,
  crmRefs,
  guardCrm,
  optionalDate,
  revalidateCrm,
  type CrmActionState,
  type CrmGuard,
} from "@/lib/crm/actions-kit";
import { loadCrmWorkspace, type CrmWorkspace } from "@/lib/crm/loader";
import {
  isSpendOrder,
  loyaltyConfigFor,
  pointsForOrder,
  redemptionValue,
  tierForLifetimePoints,
} from "@/lib/crm/metrics";
import { newCrmId } from "@/lib/crm/repository";
import { formatMoney } from "@/lib/format";
import {
  MEMBERSHIP_STATUSES,
  type LoyaltyConfig,
  type LoyaltyTier,
  type LoyaltyTxKind,
  type Membership,
  type MembershipStatus,
} from "@/types/crm";

/**
 * Loyalty, points-ledger and membership writes.
 *
 * Scope: every action here moves a balance, a tier or a contract with a
 * customer, so all of them take `guardCrm("manage")` — a points adjustment is
 * a decision about money, not a logged interaction. Reading is open to every
 * role that can read the CRM.
 *
 * The loyalty *model* is never assumed: the earn rate, the value of a point,
 * whether points expire and which tiers exist all come from this brand's
 * `crm_settings.loyalty`, read back on the server through
 * `loyaltyConfigFor(crm.settings)` before a single number is written.
 */

const DAY_MS = 86_400_000;


type GuardOk = Extract<CrmGuard, { ok: true }>;

/* ------------------------------------------------------------------ */
/* Validation primitives the shared ones do not cover                  */
/* ------------------------------------------------------------------ */

function wholeNumber(value: unknown, field: string): Validated<number> {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || !Number.isInteger(n) || Math.abs(n) > 1_000_000) {
    return { ok: false, message: `Enter ${field.toLowerCase()} as a whole number.` };
  }
  return { ok: true, value: n };
}

function positivePoints(value: unknown, field: string): Validated<number> {
  const parsed = wholeNumber(value, field);
  if (!parsed.ok) return parsed;
  if (parsed.value <= 0) return { ok: false, message: `${field} must be at least 1.` };
  return parsed;
}

/** A rate (points per unit, currency per point): ≥ 0, keeps six decimals. */
function rate(value: unknown, field: string): Validated<number> {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n < 0) {
    return { ok: false, message: `Enter a valid ${field.toLowerCase()}.` };
  }
  return { ok: true, value: Math.round(n * 1_000_000) / 1_000_000 };
}

/** Blank means "never expires" — the only null in the config. */
function expiryDays(value: unknown): Validated<number | null> {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (raw === "") return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 3650) {
    return {
      ok: false,
      message:
        "Expiry must be a whole number of days (1–3650), or blank for points that never expire.",
    };
  }
  return { ok: true, value: n };
}

async function knownCustomerId(
  value: unknown,
  crm: CrmWorkspace,
): Promise<Validated<string>> {
  const id = refId(value, crmRefs(crm).customerIds, "Customer", true);
  if (!id.ok) return id;
  if (!id.value) return { ok: false, message: "Pick a customer." };
  return { ok: true, value: id.value };
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

/* ------------------------------------------------------------------ */
/* Settings — the brand's own loyalty model                            */
/* ------------------------------------------------------------------ */

export type LoyaltyTierInput = {
  name?: string | null;
  min_lifetime_points?: string | number | null;
  discount_percent?: string | number | null;
};

export type LoyaltySettingsInput = {
  enabled?: boolean | string | null;
  earn_points_per_unit: string | number;
  redeem_value_per_point: string | number;
  /** Blank / null = points never expire. */
  expiry_days?: string | number | null;
  tiers?: LoyaltyTierInput[] | null;
};

/**
 * The tier ladder as typed: blank rows are dropped, names must be unique,
 * thresholds must be whole and distinct, and the ladder is stored bottom-up so
 * the screen renders it in the order it was configured to be reached.
 */
function tierLadder(value: LoyaltyTierInput[] | null | undefined): Validated<LoyaltyTier[]> {
  const rows = Array.isArray(value) ? value.slice(0, 20) : [];
  const tiers: LoyaltyTier[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const rawName = String(row?.name ?? "").trim();
    const rawMin = String(row?.min_lifetime_points ?? "").trim();
    const rawDiscount = String(row?.discount_percent ?? "").trim();
    if (!rawName && !rawMin && !rawDiscount) continue;

    const name = text(rawName, "Tier name", 40);
    if (!name.ok) return name;
    const key = name.value.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, message: `Two tiers are both called “${name.value}”.` };
    }
    seen.add(key);

    const min = rawMin === "" ? { ok: true as const, value: 0 } : wholeNumber(rawMin, "Tier threshold");
    if (!min.ok) return min;
    if (min.value < 0) {
      return { ok: false, message: "Tier thresholds cannot be negative." };
    }

    let discount: Validated<number | null> = { ok: true, value: null };
    if (rawDiscount !== "") {
      const n = Number(rawDiscount);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        discount = { ok: false, message: "Tier discount must be between 0 and 100." };
      } else {
        discount = { ok: true, value: Math.round(n * 100) / 100 };
      }
    }
    if (!discount.ok) return discount;

    tiers.push({
      name: name.value,
      min_lifetime_points: min.value,
      discount_percent: discount.value,
    });
  }

  const ordered = [...tiers].sort(
    (a, b) => a.min_lifetime_points - b.min_lifetime_points,
  );
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].min_lifetime_points === ordered[i - 1].min_lifetime_points) {
      return {
        ok: false,
        message: "Each tier needs its own lifetime-points threshold.",
      };
    }
  }
  return { ok: true, value: ordered };
}

export async function saveLoyaltySettingsAction(
  input: LoyaltySettingsInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const earn = rate(input.earn_points_per_unit, "Earn rate");
  if (!earn.ok) return earn;
  const redeem = rate(input.redeem_value_per_point, "Redemption value");
  if (!redeem.ok) return redeem;
  const expiry = expiryDays(input.expiry_days);
  if (!expiry.ok) return expiry;
  const tiers = tierLadder(input.tiers);
  if (!tiers.ok) return tiers;

  const enabled = flag(input.enabled);
  if (enabled && earn.value <= 0 && redeem.value <= 0) {
    return {
      ok: false,
      message:
        "Set an earn rate or a redemption value before switching the programme on.",
    };
  }

  const config: LoyaltyConfig = {
    enabled,
    earn_points_per_unit: earn.value,
    redeem_value_per_point: redeem.value,
    // The one rounding rule the type allows; pointsForOrder implements it.
    points: "floor",
    expiry_days: expiry.value,
    tiers: tiers.value,
  };

  // One settings row per brand. Pick-lists the rest of the CRM owns are passed
  // through untouched, so saving loyalty rules cannot blank them.
  const id = crm.settings.id;
  const saved = await crm.repo.save("crm_settings", {
    id,
    brand_id: guard.brandId,
    loyalty: config,
    lead_sources: crm.settings.lead_sources ?? [],
    review_sources: crm.settings.review_sources ?? [],
  });

  await auditCrm(
    guard,
    "crm.loyalty.settings_updated",
    "crm_settings",
    saved.id,
    `enabled=${config.enabled} earn=${config.earn_points_per_unit}/unit redeem=${config.redeem_value_per_point}/point expiry=${config.expiry_days ?? "never"} tiers=${config.tiers.length}`,
  );
  revalidateCrm();
  return { ok: true, message: "Loyalty configuration saved." };
}

/* ------------------------------------------------------------------ */
/* Points ledger                                                       */
/* ------------------------------------------------------------------ */

type PointsWrite = {
  customerId: string;
  kind: LoyaltyTxKind;
  /** Signed, exactly as it is stored on the transaction. */
  points: number;
  /** How lifetime points move: earns and adjustments yes, redemptions no. */
  lifetimeDelta: number;
  reason: string | null;
  orderId: string | null;
};

/**
 * The single write path for a points movement: one `loyalty_transactions` row
 * *and* the account it belongs to (balance, lifetime, tier, last activity) in
 * the same call, with `balance_after` recorded on the ledger row. An account is
 * created on first award — no one has to enrol a customer before paying them.
 */
async function writePoints(
  guard: GuardOk,
  crm: CrmWorkspace,
  write: PointsWrite,
): Promise<CrmActionState> {
  const config = loyaltyConfigFor(crm.settings);
  const accounts = await crm.repo.list("loyalty_accounts");
  const account =
    accounts.find((row) => row.customer_id === write.customerId) ?? null;

  const balance = (account?.points_balance ?? 0) + write.points;
  if (balance < 0) {
    return {
      ok: false,
      message: `This account holds ${account?.points_balance ?? 0} points — that would take the balance below zero.`,
    };
  }
  const lifetime = Math.max(
    0,
    (account?.lifetime_points ?? 0) + write.lifetimeDelta,
  );
  const now = new Date().toISOString();
  const tier = tierForLifetimePoints(lifetime, config);
  const accountId = account?.id ?? newCrmId();

  const savedAccount = account
    ? await crm.repo.patch("loyalty_accounts", accountId, {
        points_balance: balance,
        lifetime_points: lifetime,
        tier,
        last_activity_at: now,
      })
    : await crm.repo.save("loyalty_accounts", {
        id: accountId,
        brand_id: guard.brandId,
        customer_id: write.customerId,
        points_balance: balance,
        lifetime_points: lifetime,
        tier,
        last_activity_at: now,
      });
  if (!savedAccount) return { ok: false, message: "Loyalty account not found." };

  // Expiry comes from the config that is live at the moment points are earned.
  const expiresAt =
    write.points > 0 && config.expiry_days && config.expiry_days > 0
      ? new Date(Date.parse(now) + config.expiry_days * DAY_MS).toISOString()
      : null;

  const txn = await crm.repo.save("loyalty_transactions", {
    id: newCrmId(),
    brand_id: guard.brandId,
    account_id: savedAccount.id,
    customer_id: write.customerId,
    kind: write.kind,
    points: write.points,
    balance_after: balance,
    reason: write.reason,
    order_id: write.orderId,
    expires_at: expiresAt,
  });

  await auditCrm(
    guard,
    `crm.loyalty.${write.kind}`,
    "loyalty_transaction",
    txn.id,
    `${signed(write.points)} points · balance ${balance} · tier ${tier ?? "none"}`,
  );
  revalidateCrm(`/customers/${write.customerId}`);
  return {
    ok: true,
    message: config.enabled
      ? `${signed(write.points)} points · balance ${balance}, worth ${formatMoney(redemptionValue(balance, config), crm.currencyCode)}.`
      : `${signed(write.points)} points · balance ${balance}.`,
  };
}

export type PointsAdjustmentInput = {
  customer_id: string;
  points: string | number;
  reason?: string | null;
};

/** Goodwill points. Lifetime points rise with them, so tiers can be reached. */
export async function awardBonusPointsAction(
  input: PointsAdjustmentInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerId = await knownCustomerId(input.customer_id, crm);
  if (!customerId.ok) return customerId;
  const points = positivePoints(input.points, "Bonus points");
  if (!points.ok) return points;
  const reason = text(input.reason, "Reason", 200, false);
  if (!reason.ok) return reason;

  return writePoints(guard, crm, {
    customerId: customerId.value,
    kind: "bonus",
    points: points.value,
    lifetimeDelta: points.value,
    reason: reason.value || "Bonus points",
    orderId: null,
  });
}

/**
 * Honour a redemption. Refuses when the points asked for are more than the
 * account holds — a negative balance is never written. Lifetime points are
 * untouched: they are a record of what the customer has earned.
 */
export async function redeemPointsAction(
  input: PointsAdjustmentInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerId = await knownCustomerId(input.customer_id, crm);
  if (!customerId.ok) return customerId;
  const points = positivePoints(input.points, "Points to redeem");
  if (!points.ok) return points;
  const reason = text(input.reason, "Reason", 200, false);
  if (!reason.ok) return reason;

  const config = loyaltyConfigFor(crm.settings);
  const result = await writePoints(guard, crm, {
    customerId: customerId.value,
    kind: "redeem",
    points: -points.value,
    lifetimeDelta: 0,
    reason: reason.value || "Points redeemed",
    orderId: null,
  });
  if (result.ok && config.enabled) {
    return {
      ok: true,
      message: `Redeemed ${points.value} points (about ${formatMoney(redemptionValue(points.value, config), crm.currencyCode)}). ${result.message}`,
    };
  }
  return result;
}

/** Correction: signed on purpose, so a mis-award can be taken back. */
export async function adjustPointsAction(
  input: PointsAdjustmentInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerId = await knownCustomerId(input.customer_id, crm);
  if (!customerId.ok) return customerId;
  const points = wholeNumber(input.points, "Adjustment");
  if (!points.ok) return points;
  if (points.value === 0) {
    return { ok: false, message: "Enter points to add (positive) or remove (negative)." };
  }
  // A ledger row that moves a balance without a reason is not auditable.
  const reason = text(input.reason, "Reason", 200);
  if (!reason.ok) return reason;

  return writePoints(guard, crm, {
    customerId: customerId.value,
    kind: "adjust",
    points: points.value,
    lifetimeDelta: points.value,
    reason: reason.value,
    orderId: null,
  });
}

export type AwardFromOrderInput = {
  order_id: string;
  reason?: string | null;
};

/**
 * Award the points a posted order earned, using this brand's own earn rate.
 * An order id on the ledger is the idempotency key: awarding twice is refused
 * rather than silently double-paid.
 */
export async function awardOrderPointsAction(
  input: AwardFromOrderInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const orderId = refId(input.order_id, crmRefs(crm).orderIds, "Order", true);
  if (!orderId.ok || !orderId.value) {
    return { ok: false, message: orderId.ok ? "Pick an order." : orderId.message };
  }
  const order = crm.orders.find((row) => row.id === orderId.value);
  if (!order) return { ok: false, message: "Order not found." };
  if (!isSpendOrder(order)) {
    return {
      ok: false,
      message: "Only confirmed or completed orders can earn points.",
    };
  }
  const customerId = await knownCustomerId(order.customer_id, crm);
  if (!customerId.ok) {
    return { ok: false, message: "This order has no customer to credit points to." };
  }

  const alreadyAwarded = crm.loyaltyTransactions.some(
    (txn) => txn.order_id === order.id && txn.points > 0,
  );
  if (alreadyAwarded) {
    return { ok: false, message: "Points have already been awarded for this order." };
  }

  const config = loyaltyConfigFor(crm.settings);
  if (!config.enabled) {
    return {
      ok: false,
      message: "This brand's loyalty programme is off, so orders earn no points. Turn it on in Settings.",
    };
  }
  const points = pointsForOrder(order.grand_total, config);
  if (points <= 0) {
    return {
      ok: false,
      message: `An order of ${formatMoney(order.grand_total, crm.currencyCode)} earns no points at the configured earn rate.`,
    };
  }
  const reason = text(input.reason, "Reason", 200, false);
  if (!reason.ok) return reason;

  return writePoints(guard, crm, {
    customerId: customerId.value,
    kind: "earn",
    points,
    lifetimeDelta: points,
    reason: reason.value || `Order ${order.order_number}`,
    orderId: order.id,
  });
}

/* ------------------------------------------------------------------ */
/* Memberships — plans the business names itself                       */
/* ------------------------------------------------------------------ */

export type MembershipInput = {
  customer_id: string;
  plan: string;
  benefits?: string | null;
  price?: string | number | null;
  started_at?: string | null;
  ends_at?: string | null;
  auto_renew?: boolean | string | null;
  status?: string | null;
};

function benefitList(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => line.slice(0, 120));
}

/**
 * Start a membership. The plan name, the benefits and the price are whatever
 * the owner types — there is no plan catalogue here and no payment taken. The
 * price is stored on the membership row purely so the record says what was
 * agreed.
 */
export async function createMembershipAction(
  input: MembershipInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerId = await knownCustomerId(input.customer_id, crm);
  if (!customerId.ok) return customerId;
  const plan = text(input.plan, "Plan name", 80);
  if (!plan.ok) return plan;
  const price = money(input.price ?? 0, "Price");
  if (!price.ok) return price;
  const started = optionalDate(input.started_at);
  if (!started.ok) return started;
  const ends = optionalDate(input.ends_at);
  if (!ends.ok) return ends;
  const status = input.status
    ? oneOf(input.status, MEMBERSHIP_STATUSES, "Status")
    : { ok: true as const, value: "active" as const };
  if (!status.ok) return status;

  const startedAt = started.value ?? new Date().toISOString();
  if (ends.value && Date.parse(ends.value) <= Date.parse(startedAt)) {
    return { ok: false, message: "The end date must be after the start date." };
  }

  const row: Omit<Membership, "created_at" | "updated_at"> & { id: string } = {
    id: newCrmId(),
    brand_id: guard.brandId,
    customer_id: customerId.value,
    plan: plan.value,
    status: status.value as MembershipStatus,
    started_at: startedAt,
    ends_at: ends.value,
    auto_renew: flag(input.auto_renew),
    benefits: benefitList(input.benefits),
    price: price.value,
  };
  const saved = await crm.repo.save("memberships", row);

  await auditCrm(
    guard,
    "crm.membership.created",
    "membership",
    saved.id,
    `${saved.plan} · ${formatMoney(saved.price, crm.currencyCode)}`,
  );
  revalidateCrm(`/customers/${customerId.value}`);
  return { ok: true, message: `${saved.plan} membership recorded.` };
}

/**
 * Renew: back to active, optionally with a new end date. The length of a term
 * is the business's decision, so a blank date reactivates the membership
 * exactly as it was rather than inventing a period.
 */
export async function renewMembershipAction(
  id: string,
  endsAt?: string | null,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const membership = await crm.repo.find("memberships", id);
  if (!membership) return { ok: false, message: "Membership not found." };
  const ends = optionalDate(endsAt);
  if (!ends.ok) return ends;
  if (ends.value && Date.parse(ends.value) <= Date.parse(membership.started_at)) {
    return { ok: false, message: "The new end date must be after the start date." };
  }

  const updated = await crm.repo.patch(
    "memberships",
    id,
    ends.value ? { status: "active", ends_at: ends.value } : { status: "active" },
  );
  if (!updated) return { ok: false, message: "Membership not found." };

  await auditCrm(
    guard,
    "crm.membership.renewed",
    "membership",
    id,
    `${updated.plan}${updated.ends_at ? ` → ${updated.ends_at.slice(0, 10)}` : ""}`,
  );
  revalidateCrm(`/customers/${updated.customer_id}`);
  return { ok: true, message: `${updated.plan} renewed.` };
}

/** Pause, cancel or bring a membership back. No refund, no charge. */
export async function setMembershipStatusAction(
  id: string,
  status: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const parsed = oneOf(status, MEMBERSHIP_STATUSES, "Status");
  if (!parsed.ok) return parsed;
  const existing = await crm.repo.find("memberships", id);
  if (!existing) return { ok: false, message: "Membership not found." };

  const updated = await crm.repo.patch("memberships", id, {
    status: parsed.value as MembershipStatus,
  });
  if (!updated) return { ok: false, message: "Membership not found." };

  await auditCrm(
    guard,
    `crm.membership.${parsed.value}`,
    "membership",
    id,
    `${updated.plan} → ${parsed.value}`,
  );
  revalidateCrm(`/customers/${updated.customer_id}`);
  return { ok: true, message: `${updated.plan} marked ${parsed.value}.` };
}
