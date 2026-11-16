import {
  LOYALTY_EARN_MODES,
  MEMBERSHIP_STATUSES,
  type LoyaltyEarnMode,
  type LoyaltyEntry,
  type LoyaltyRules,
  type LoyaltyTier,
  type Membership,
  type MembershipStatus,
} from "@/types/crm";
import type { Order } from "@/types/database";

/**
 * Loyalty is data-driven: the rules row decides whether points follow rupees or
 * orders, what a point is worth, whether points expire and which tiers exist.
 * A café and a furniture studio therefore run different programmes on the same
 * code — see `data/demo/BR-1/loyalty_rules.csv` vs `BR-2`.
 */

export function isExpired(entry: LoyaltyEntry, now: Date): boolean {
  if (entry.kind !== "earn" && entry.kind !== "bonus") return false;
  return entry.expires_at !== null && new Date(entry.expires_at) <= now;
}

/** Live balance: granted points that have not expired, less redemptions. */
export function loyaltyBalance(entries: LoyaltyEntry[], now: Date): number {
  return entries
    .filter((e) => !isExpired(e, now))
    .reduce((sum, e) => sum + e.points, 0);
}

/** Points that would lapse inside the window, soonest expiry first. */
export function expiringPoints(
  entries: LoyaltyEntry[],
  now: Date,
  withinDays: number,
): { points: number; entries: LoyaltyEntry[] } {
  const from = now.getTime();
  const horizon = from + withinDays * 86400000;
  const due = entries.filter(
    (e) =>
      (e.kind === "earn" || e.kind === "bonus") &&
      e.points > 0 &&
      e.expires_at !== null &&
      new Date(e.expires_at).getTime() > from &&
      new Date(e.expires_at).getTime() <= horizon,
  );
  return {
    points: due.reduce((sum, e) => sum + e.points, 0),
    entries: due.sort(
      (a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime(),
    ),
  };
}

/** When points earned today would lapse under the brand's expiry rule. */
export function expiryFor(rules: LoyaltyRules, earnedAt: Date): string | null {
  if (rules.expiry_days === null) return null;
  return new Date(earnedAt.getTime() + rules.expiry_days * 86400000).toISOString();
}

/** What one completed bill earns under the brand's earn rule. */
export function pointsForOrder(rules: LoyaltyRules, order: Order): number {
  if (order.status === "cancelled" || order.status === "refunded") return 0;
  const base =
    rules.earn_mode === "per_amount"
      ? rules.earn_amount_per_point > 0
        ? Math.floor(order.grand_total / rules.earn_amount_per_point)
        : 0
      : rules.earn_points_per_order;
  return Math.max(0, Math.round(base));
}

/** Currency a balance is worth at the brand's redemption value. */
export function pointsValue(rules: LoyaltyRules, points: number): number {
  return Math.round(points * rules.point_value * 100) / 100;
}

/** Highest tier the customer's lifetime spend has unlocked. */
export function tierForSpend(rules: LoyaltyRules, lifetimeValue: number): LoyaltyTier | null {
  return (
    [...rules.tiers]
      .sort((a, b) => b.min_spend - a.min_spend)
      .find((t) => lifetimeValue >= t.min_spend) ?? null
  );
}

export function tierById(rules: LoyaltyRules, tierId: string | null): LoyaltyTier | null {
  if (!tierId) return null;
  return rules.tiers.find((t) => t.id === tierId) ?? null;
}

export type RedemptionCheck =
  | { ok: true; worth: number }
  | { ok: false; message: string };

/**
 * Server-side redemption rule. A balance is only spendable when the programme
 * allows it, the points exist and have not lapsed, and the request is whole.
 */
export function checkRedemption(params: {
  rules: LoyaltyRules | null;
  entries: LoyaltyEntry[];
  points: number;
  now: Date;
}): RedemptionCheck {
  const { rules, entries, now } = params;
  if (!rules) return { ok: false, message: "This brand has no loyalty programme configured." };
  if (!rules.redemption_enabled) {
    return { ok: false, message: "Redemption is switched off for this programme." };
  }
  const points = Math.trunc(params.points);
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, message: "Enter how many points to redeem." };
  }
  const balance = loyaltyBalance(entries, now);
  if (points > balance) {
    return {
      ok: false,
      message: `Only ${balance} points available — that redemption is too large.`,
    };
  }
  return { ok: true, worth: pointsValue(rules, points) };
}

export type LoyaltySummary = {
  members: number;
  pointsOutstanding: number;
  pointsRedeemed: number;
  pointsExpired: number;
  valueOutstanding: number;
  byTier: { tier: LoyaltyTier; members: number }[];
};

export function loyaltySummary(params: {
  rules: LoyaltyRules | null;
  entries: LoyaltyEntry[];
  lifetimeValueByCustomer: Map<string, number>;
  now: Date;
}): LoyaltySummary {
  const { rules, entries, lifetimeValueByCustomer, now } = params;
  const holders = new Set(entries.map((e) => e.customer_id));
  const balances = new Map<string, number>();
  for (const entry of entries) {
    balances.set(
      entry.customer_id,
      (balances.get(entry.customer_id) ?? 0) + (isExpired(entry, now) ? 0 : entry.points),
    );
  }
  return {
    members: holders.size,
    pointsOutstanding: [...balances.values()].filter((n) => n > 0).reduce((s, n) => s + n, 0),
    pointsRedeemed: -entries.filter((e) => e.kind === "redeem").reduce((s, e) => s + e.points, 0),
    pointsExpired: -entries.filter((e) => e.kind === "expire").reduce((s, e) => s + e.points, 0),
    valueOutstanding: rules
      ? pointsValue(rules, [...balances.values()].reduce((s, n) => s + Math.max(0, n), 0))
      : 0,
    byTier: rules
      ? rules.tiers
          .map((tier) => ({
            tier,
            members: [...lifetimeValueByCustomer.values()].filter((v) => {
              const reached = tierForSpend(rules, v);
              return reached?.id === tier.id;
            }).length,
          }))
          .sort((a, b) => b.tier.min_spend - a.tier.min_spend)
      : [],
  };
}

/**
 * Forms write ledger rows, and nobody types a sign by hand: `earn` and `bonus`
 * are always positive, `expire` always negative, and only a `adjust` correction
 * keeps the sign it was given. That way one mistyped minus cannot move a balance
 * twice.
 */
export const GRANT_KINDS = ["earn", "bonus", "adjust", "expire"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export const GRANT_KIND_LABELS: Record<GrantKind, string> = {
  earn: "Award points",
  bonus: "Bonus",
  adjust: "Correction",
  expire: "Expire now",
};

export type GrantInput = {
  customer_id: string;
  kind: string;
  points: string;
  reason: string;
  order_id: string;
};

export const EMPTY_GRANT_INPUT: GrantInput = {
  customer_id: "",
  kind: "earn",
  points: "",
  reason: "",
  order_id: "",
};

export type NewLoyaltyEntry = Omit<LoyaltyEntry, "id" | "brand_id" | "created_at">;

export function validateGrantInput(
  input: GrantInput,
  known: {
    rules: LoyaltyRules | null;
    customerIds: string[];
    orderIds: string[];
  },
  now: Date = new Date(),
): { ok: true; value: NewLoyaltyEntry } | { ok: false; message: string } {
  if (!GRANT_KINDS.includes(input.kind as GrantKind)) {
    return { ok: false, message: "Pick what kind of ledger entry this is." };
  }
  const customerId = input.customer_id.trim();
  if (!customerId) return { ok: false, message: "Choose the member." };
  if (!known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." };
  }
  const typed = Math.trunc(Number(input.points));
  if (!Number.isFinite(typed) || typed === 0) {
    return { ok: false, message: "Enter how many points, as a whole number other than zero." };
  }
  const reason = input.reason.trim().slice(0, 200);
  if (!reason) return { ok: false, message: "Say why — the ledger is an audit trail." };
  const kind = input.kind as GrantKind;
  const orderId = input.order_id.trim();
  if (orderId && !known.orderIds.includes(orderId)) {
    return { ok: false, message: "That bill is not in the orders list." };
  }
  // The sign follows the kind, never the keypad: an award is a credit, an
  // expiry a removal, and only a correction may be written either way.
  const signed =
    kind === "adjust" ? typed : kind === "expire" ? -Math.abs(typed) : Math.abs(typed);
  return {
    ok: true,
    value: {
      customer_id: customerId,
      kind,
      points: signed,
      reason,
      order_id: orderId || null,
      expires_at: signed > 0 && known.rules ? expiryFor(known.rules, now) : null,
    },
  };
}

export type MembershipInput = {
  customer_id: string;
  tier_id: string;
  started_at: string;
  expires_at: string;
  status: string;
  notes: string;
};

export const EMPTY_MEMBERSHIP_INPUT: MembershipInput = {
  customer_id: "",
  tier_id: "",
  started_at: "",
  expires_at: "",
  status: "active",
  notes: "",
};

export type NewMembership = Omit<Membership, "id" | "brand_id">;

export function validateMembershipInput(
  input: MembershipInput,
  known: { customerIds: string[]; tierIds: string[] },
  now: Date = new Date(),
): { ok: true; value: NewMembership } | { ok: false; message: string } {
  const customerId = input.customer_id.trim();
  if (!customerId) return { ok: false, message: "Choose the member." };
  if (!known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." };
  }
  const tierId = input.tier_id.trim();
  if (!tierId) return { ok: false, message: "Choose a tier." };
  if (!known.tierIds.includes(tierId)) {
    return { ok: false, message: "That tier is not in this programme." };
  }
  if (!MEMBERSHIP_STATUSES.includes(input.status as MembershipStatus)) {
    return { ok: false, message: "Pick a membership status." };
  }
  const startedRaw = input.started_at.trim();
  const started = startedRaw ? new Date(startedRaw) : now;
  if (Number.isNaN(started.getTime())) {
    return { ok: false, message: "That start date doesn't look right." };
  }
  const expiresRaw = input.expires_at.trim();
  let expires: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "That expiry date doesn't look right." };
    }
    if (parsed <= started) {
      return { ok: false, message: "A membership cannot expire before it starts." };
    }
    expires = parsed.toISOString();
  }
  return {
    ok: true,
    value: {
      customer_id: customerId,
      tier_id: tierId,
      started_at: started.toISOString(),
      expires_at: expires,
      status: input.status as MembershipStatus,
      notes: input.notes.trim().slice(0, 300) || null,
    },
  };
}

/**
 * The programme editor. Tiers are typed one per line as
 * `Name, lifetime spend to reach, discount %` — the same three fields the CSV
 * pack carries, so a hand-edited programme still round-trips into an export.
 */
export type LoyaltyRulesInput = {
  earn_mode: string;
  earn_amount_per_point: string;
  earn_points_per_order: string;
  point_value: string;
  expiry_days: string;
  redemption_enabled: string;
  tiers: string;
};

export const EMPTY_LOYALTY_RULES_INPUT: LoyaltyRulesInput = {
  earn_mode: "per_amount",
  earn_amount_per_point: "",
  earn_points_per_order: "",
  point_value: "",
  expiry_days: "",
  redemption_enabled: "yes",
  tiers: "",
};

function num(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function tierSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function tiersToLines(tiers: LoyaltyTier[]): string {
  return tiers.map((t) => `${t.name}, ${t.min_spend}, ${t.discount_percent}`).join("\n");
}

export function loyaltyRulesToInput(rules: LoyaltyRules | null): LoyaltyRulesInput {
  if (!rules) return EMPTY_LOYALTY_RULES_INPUT;
  return {
    earn_mode: rules.earn_mode,
    earn_amount_per_point: String(rules.earn_amount_per_point),
    earn_points_per_order: String(rules.earn_points_per_order),
    point_value: String(rules.point_value),
    expiry_days: rules.expiry_days === null ? "" : String(rules.expiry_days),
    redemption_enabled: rules.redemption_enabled ? "yes" : "no",
    tiers: tiersToLines(rules.tiers),
  };
}

export function parseTierLines(text: string): {
  tiers: LoyaltyTier[];
  error: string | null;
} {
  const tiers: LoyaltyTier[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 3) {
      return { tiers: [], error: `Tier line ${index + 1} needs name, spend and discount.` };
    }
    const [name, spendRaw, discountRaw] = parts;
    const minSpend = num(spendRaw);
    const discount = num(discountRaw);
    if (!name) return { tiers: [], error: `Tier line ${index + 1} has no name.` };
    if (minSpend === null || minSpend < 0) {
      return { tiers: [], error: `Tier "${name}" needs a spend amount of 0 or more.` };
    }
    if (discount === null || discount < 0 || discount > 100) {
      return { tiers: [], error: `Tier "${name}" needs a discount between 0 and 100.` };
    }
    const id = tierSlug(name);
    if (tiers.some((t) => t.id === id)) {
      return { tiers: [], error: `Two tiers are both called "${name}".` };
    }
    tiers.push({ id, name: name.slice(0, 40), min_spend: minSpend, discount_percent: discount });
  }
  if (!tiers.length) return { tiers: [], error: "List at least one tier." };
  tiers.sort((a, b) => a.min_spend - b.min_spend);
  return { tiers, error: null };
}

export type LoyaltyRulesValues = Omit<LoyaltyRules, "brand_id">;

export function validateLoyaltyRulesInput(
  input: LoyaltyRulesInput,
): { ok: true; value: LoyaltyRulesValues } | { ok: false; message: string } {
  if (!LOYALTY_EARN_MODES.includes(input.earn_mode as LoyaltyEarnMode)) {
    return { ok: false, message: "Pick how points are earned." };
  }
  const pointValue = num(input.point_value);
  if (pointValue === null || pointValue <= 0) {
    return { ok: false, message: "A point needs a value above zero." };
  }
  const earnMode = input.earn_mode as LoyaltyEarnMode;
  const amountPerPoint = num(input.earn_amount_per_point) ?? 0;
  const pointsPerOrder = num(input.earn_points_per_order) ?? 0;
  if (earnMode === "per_amount" && amountPerPoint <= 0) {
    return { ok: false, message: "Say how much money earns one point." };
  }
  if (earnMode === "per_order" && pointsPerOrder <= 0) {
    return { ok: false, message: "Say how many points one order earns." };
  }
  const expiryRaw = input.expiry_days.trim();
  let expiryDays: number | null = null;
  if (expiryRaw) {
    const parsed = num(expiryRaw);
    if (parsed === null || parsed < 1 || !Number.isInteger(parsed)) {
      return { ok: false, message: "Expiry has to be a whole number of days, or blank." };
    }
    expiryDays = parsed;
  }
  const { tiers, error } = parseTierLines(input.tiers);
  if (error) return { ok: false, message: error };
  return {
    ok: true,
    value: {
      earn_mode: earnMode,
      earn_amount_per_point: amountPerPoint,
      earn_points_per_order: pointsPerOrder,
      point_value: pointValue,
      expiry_days: expiryDays,
      redemption_enabled: input.redemption_enabled !== "no",
      tiers,
    },
  };
}
