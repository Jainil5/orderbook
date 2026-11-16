import type { SegmentRules } from "@/types/crm";
import type { CustomerProfile } from "./metrics";

/**
 * Dynamic segments are stored filter conditions, evaluated against the same
 * profiles the directory shows. Membership is never hand-maintained, so a
 * "Lapsed" list cannot go stale between visits.
 */

export type SegmentMatcher = (profile: CustomerProfile) => boolean;

function hasTag(profile: CustomerProfile, tag: string): boolean {
  return profile.tags.includes(tag);
}

/** Empty rules would match everyone, which is never what a saved filter means. */
export function isUsableRules(rules: SegmentRules | null): rules is SegmentRules {
  if (!rules) return false;
  return Object.values(rules).some((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

export function rulesToMatcher(rules: SegmentRules): SegmentMatcher {
  return (profile) => {
    if (rules.minOrders !== undefined && profile.orders < rules.minOrders) return false;
    if (rules.maxOrders !== undefined && profile.orders > rules.maxOrders) return false;
    if (rules.minSpend !== undefined && profile.lifetimeValue < rules.minSpend) return false;
    if (rules.maxSpend !== undefined && profile.lifetimeValue > rules.maxSpend) return false;
    if (
      rules.inactiveDays !== undefined &&
      (profile.daysSinceLastOrder === null || profile.daysSinceLastOrder < rules.inactiveDays)
    ) {
      return false;
    }
    if (
      rules.activeWithinDays !== undefined &&
      (profile.daysSinceLastOrder === null ||
        profile.daysSinceLastOrder > rules.activeWithinDays)
    ) {
      return false;
    }
    if (rules.joinedWithinDays !== undefined && profile.daysSinceJoin > rules.joinedWithinDays) {
      return false;
    }
    if (rules.tags?.length && !rules.tags.every((t) => hasTag(profile, t))) return false;
    if (rules.source && profile.source.toLowerCase() !== rules.source.toLowerCase()) return false;
    if (rules.priceTier && profile.priceTier !== rules.priceTier) return false;
    if (profile.avgRating === null) {
      if (rules.minRating !== undefined || rules.maxRating !== undefined) return false;
    } else {
      if (rules.minRating !== undefined && profile.avgRating < rules.minRating) return false;
      if (rules.maxRating !== undefined && profile.avgRating > rules.maxRating) return false;
    }
    if (rules.hasOpenComplaints === true && profile.openComplaints === 0) return false;
    if (rules.hasOpenComplaints === false && profile.openComplaints > 0) return false;
    if (rules.hasOutstandingDues === true && profile.dues <= 0) return false;
    if (rules.hasOutstandingDues === false && profile.dues > 0) return false;
    if (rules.minLoyaltyPoints !== undefined && profile.loyaltyPoints < rules.minLoyaltyPoints) {
      return false;
    }
    if (
      rules.loyaltyTier &&
      (profile.loyaltyTierId ?? profile.membershipTierId) !== rules.loyaltyTier
    ) {
      return false;
    }
    return true;
  };
}

export function segmentMemberIds(
  rules: SegmentRules,
  profiles: CustomerProfile[],
): string[] {
  const match = rulesToMatcher(rules);
  return profiles.filter(match).map((p) => p.customer.id);
}

/** Members of a manual segment, minus anyone deleted or archived since. */
export function manualMemberIds(memberIds: string[], profiles: CustomerProfile[]): string[] {
  const known = new Set(profiles.map((p) => p.customer.id));
  return memberIds.filter((id) => known.has(id));
}

/** A rule set in plain English, for the segment card and the campaign picker. */
export function describeRules(rules: SegmentRules): string {
  const parts: string[] = [];
  const atLeast = (label: string, value: number | undefined, unit = "") => {
    if (value !== undefined) parts.push(`${label} ${value}${unit}`);
  };
  const atMost = (label: string, value: number | undefined, unit = "") => {
    if (value !== undefined) parts.push(`at most ${label} ${value}${unit}`);
  };
  atLeast("orders ≥", rules.minOrders);
  atMost("orders", rules.maxOrders);
  atLeast("spend ≥", rules.minSpend);
  atMost("spend", rules.maxSpend);
  if (rules.inactiveDays !== undefined) parts.push(`quiet for ${rules.inactiveDays}+ days`);
  if (rules.activeWithinDays !== undefined) parts.push(`bought in last ${rules.activeWithinDays} days`);
  if (rules.joinedWithinDays !== undefined) parts.push(`joined in last ${rules.joinedWithinDays} days`);
  if (rules.tags?.length) parts.push(`tagged ${rules.tags.join(" + ")}`);
  if (rules.source) parts.push(`from ${rules.source}`);
  if (rules.priceTier) parts.push(`${rules.priceTier} price list`);
  atLeast("rating ≥", rules.minRating, "★");
  atMost("rating", rules.maxRating, "★");
  if (rules.hasOpenComplaints === true) parts.push("with an open complaint");
  if (rules.hasOpenComplaints === false) parts.push("no open complaints");
  if (rules.hasOutstandingDues === true) parts.push("owing money");
  if (rules.hasOutstandingDues === false) parts.push("nothing outstanding");
  atLeast("loyalty points ≥", rules.minLoyaltyPoints);
  if (rules.loyaltyTier) parts.push(`tier ${rules.loyaltyTier}`);
  return parts.join(" · ");
}

/** Rules a UI form edits as strings, so empty inputs can be dropped cleanly. */
export type SegmentRuleInput = {
  minOrders: string;
  maxOrders: string;
  minSpend: string;
  maxSpend: string;
  inactiveDays: string;
  activeWithinDays: string;
  joinedWithinDays: string;
  tags: string;
  source: string;
  priceTier: string;
  minRating: string;
  maxRating: string;
  hasOpenComplaints: string;
  hasOutstandingDues: string;
  minLoyaltyPoints: string;
  loyaltyTier: string;
};

export const EMPTY_SEGMENT_RULE_INPUT: SegmentRuleInput = {
  minOrders: "",
  maxOrders: "",
  minSpend: "",
  maxSpend: "",
  inactiveDays: "",
  activeWithinDays: "",
  joinedWithinDays: "",
  tags: "",
  source: "",
  priceTier: "",
  minRating: "",
  maxRating: "",
  hasOpenComplaints: "",
  hasOutstandingDues: "",
  minLoyaltyPoints: "",
  loyaltyTier: "",
};

function toInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export function segmentRulesFromInput(
  input: SegmentRuleInput,
): { rules: SegmentRules | null; error: string | null } {
  const num = (value: string) => toInt(value);
  const minOrders = num(input.minOrders);
  const maxOrders = num(input.maxOrders);
  const minSpend = num(input.minSpend);
  const maxSpend = num(input.maxSpend);
  const minRating = num(input.minRating);
  const maxRating = num(input.maxRating);

  if (minOrders !== undefined && maxOrders !== undefined && minOrders > maxOrders) {
    return { rules: null, error: "Minimum orders cannot exceed maximum orders." };
  }
  if (minSpend !== undefined && maxSpend !== undefined && minSpend > maxSpend) {
    return { rules: null, error: "Minimum spend cannot exceed maximum spend." };
  }
  if (minRating !== undefined && (minRating < 1 || minRating > 5)) {
    return { rules: null, error: "Rating must be between 1 and 5 stars." };
  }
  if (maxRating !== undefined && (maxRating < 1 || maxRating > 5)) {
    return { rules: null, error: "Rating must be between 1 and 5 stars." };
  }

  const rules: SegmentRules = {};
  if (minOrders !== undefined) rules.minOrders = minOrders;
  if (maxOrders !== undefined) rules.maxOrders = maxOrders;
  if (minSpend !== undefined) rules.minSpend = minSpend;
  if (maxSpend !== undefined) rules.maxSpend = maxSpend;
  const inactiveDays = num(input.inactiveDays);
  if (inactiveDays !== undefined) rules.inactiveDays = inactiveDays;
  const activeWithinDays = num(input.activeWithinDays);
  if (activeWithinDays !== undefined) rules.activeWithinDays = activeWithinDays;
  const joinedWithinDays = num(input.joinedWithinDays);
  if (joinedWithinDays !== undefined) rules.joinedWithinDays = joinedWithinDays;
  const tags = input.tags
    .split(/[,\n|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length) rules.tags = tags;
  if (input.source.trim()) rules.source = input.source.trim().slice(0, 60);
  if (input.priceTier === "retail" || input.priceTier === "wholesale") {
    rules.priceTier = input.priceTier;
  }
  if (minRating !== undefined) rules.minRating = minRating;
  if (maxRating !== undefined) rules.maxRating = maxRating;
  if (input.hasOpenComplaints === "yes") rules.hasOpenComplaints = true;
  if (input.hasOpenComplaints === "no") rules.hasOpenComplaints = false;
  if (input.hasOutstandingDues === "yes") rules.hasOutstandingDues = true;
  if (input.hasOutstandingDues === "no") rules.hasOutstandingDues = false;
  const minLoyaltyPoints = num(input.minLoyaltyPoints);
  if (minLoyaltyPoints !== undefined) rules.minLoyaltyPoints = minLoyaltyPoints;
  if (input.loyaltyTier.trim()) rules.loyaltyTier = input.loyaltyTier.trim().slice(0, 40);

  if (!isUsableRules(rules)) {
    return { rules: null, error: "Set at least one condition to save a dynamic segment." };
  }
  return { rules, error: null };
}

export function segmentRulesToInput(rules: SegmentRules | null): SegmentRuleInput {
  const r = rules ?? {};
  const str = (v: number | undefined) => (v === undefined ? "" : String(v));
  return {
    ...EMPTY_SEGMENT_RULE_INPUT,
    minOrders: str(r.minOrders),
    maxOrders: str(r.maxOrders),
    minSpend: str(r.minSpend),
    maxSpend: str(r.maxSpend),
    inactiveDays: str(r.inactiveDays),
    activeWithinDays: str(r.activeWithinDays),
    joinedWithinDays: str(r.joinedWithinDays),
    tags: (r.tags ?? []).join(", "),
    source: r.source ?? "",
    priceTier: r.priceTier ?? "",
    minRating: str(r.minRating),
    maxRating: str(r.maxRating),
    hasOpenComplaints:
      r.hasOpenComplaints === undefined ? "" : r.hasOpenComplaints ? "yes" : "no",
    hasOutstandingDues:
      r.hasOutstandingDues === undefined ? "" : r.hasOutstandingDues ? "yes" : "no",
    minLoyaltyPoints: str(r.minLoyaltyPoints),
    loyaltyTier: r.loyaltyTier ?? "",
  };
}
