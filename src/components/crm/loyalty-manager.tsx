"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import {
  EMPTY_GRANT_INPUT,
  EMPTY_LOYALTY_RULES_INPUT,
  EMPTY_MEMBERSHIP_INPUT,
  GRANT_KINDS,
  GRANT_KIND_LABELS,
  expiringPoints,
  isExpired,
  loyaltyRulesToInput,
  loyaltySummary,
  pointsValue,
  tierById,
  type GrantInput,
  type GrantKind,
  type LoyaltyRulesInput,
  type MembershipInput,
} from "@/lib/crm/loyalty";
import type { CustomerProfile } from "@/lib/crm/metrics";
import { toLocalInputValue } from "@/lib/manager/time";
import {
  LOYALTY_ENTRY_KINDS,
  MEMBERSHIP_STATUSES,
  type LoyaltyEntry,
  type LoyaltyEntryKind,
  type LoyaltyRules,
  type Membership,
  type MembershipStatus,
} from "@/types/crm";
import {
  grantLoyaltyPointsAction,
  redeemLoyaltyPointsAction,
  saveLoyaltyRulesAction,
  saveMembershipAction,
  setMembershipStatusAction,
  deleteMembershipAction,
} from "@/services/crm-actions";

type Filter = "all" | LoyaltyEntryKind;

const ENTRY_TONE: Record<LoyaltyEntryKind, "neutral" | "success" | "warning" | "danger"> = {
  earn: "success",
  bonus: "success",
  redeem: "warning",
  adjust: "neutral",
  expire: "danger",
};

const MEMBERSHIP_LABELS: Record<MembershipStatus, string> = {
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** What one completed bill earns, in the shopkeeper's own words. */
function describeEarnRule(rules: LoyaltyRules): string {
  return rules.earn_mode === "per_amount"
    ? `1 point per ${rules.earn_amount_per_point} spent`
    : `${rules.earn_points_per_order} ${pluralize(rules.earn_points_per_order, "point")} per bill`;
}

function toMembershipInput(membership: Membership): MembershipInput {
  return {
    customer_id: membership.customer_id,
    tier_id: membership.tier_id,
    started_at: membership.started_at.slice(0, 10),
    expires_at: membership.expires_at ? membership.expires_at.slice(0, 10) : "",
    status: membership.status,
    notes: membership.notes ?? "",
  };
}

/**
 * Points, tiers and memberships — all read from the rules row this brand
 * picked, not from a programme hardcoded in code. BR-1 earns per rupee and
 * expires yearly; BR-2 earns per bill and never expires. Same screens,
 * different maths, because the maths lives in the data.
 */
export function LoyaltyManager({
  rules,
  entries,
  memberships,
  profiles,
  bills,
  currencyCode,
  now,
}: {
  rules: LoyaltyRules | null;
  entries: LoyaltyEntry[];
  memberships: Membership[];
  profiles: CustomerProfile[];
  bills: { id: string; label: string }[];
  currencyCode: string;
  /** The server's clock, passed in so the balance the page paints matches the one the actions check. */
  now: Date;
}) {
  const router = useRouter();
  const rulesRef = useRef<HTMLDialogElement>(null);
  const grantRef = useRef<HTMLDialogElement>(null);
  const redeemRef = useRef<HTMLDialogElement>(null);
  const memberRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [grant, setGrant] = useState<GrantInput>(EMPTY_GRANT_INPUT);
  const [redeem, setRedeem] = useState<{ customer_id: string; points: string; reason: string }>({
    customer_id: "",
    points: "",
    reason: "",
  });
  const [membership, setMembership] = useState<MembershipInput>(EMPTY_MEMBERSHIP_INPUT);
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [rulesForm, setRulesForm] = useState<LoyaltyRulesInput>(EMPTY_LOYALTY_RULES_INPUT);

  const nameOf = (id: string) =>
    profiles.find((p) => p.customer.id === id)?.customer.name ?? "Unknown";

  const summary = loyaltySummary({
    rules,
    entries,
    lifetimeValueByCustomer: new Map(
      profiles.map((p) => [p.customer.id, p.lifetimeValue]),
    ),
    now,
  });

  const expiring = expiringPoints(entries, now, 30);

  const balances = profiles
    .filter((profile) => profile.loyaltyPoints !== 0)
    .map((profile) => ({ id: profile.customer.id, points: profile.loyaltyPoints }))
    .sort((a, b) => b.points - a.points);

  const redeemBalance =
    profiles.find((profile) => profile.customer.id === redeem.customer_id)?.loyaltyPoints ?? 0;

  const ledgerShown = [...entries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((e) => filter === "all" || e.kind === filter)
    .filter((e) =>
      ledgerSearch.trim()
        ? (nameOf(e.customer_id) + " " + e.reason).toLowerCase().includes(
            ledgerSearch.trim().toLowerCase(),
          )
        : true,
    )
    .slice(0, 60);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function openRules() {
    setRulesForm(loyaltyRulesToInput(rules));
    setError(null);
    rulesRef.current?.showModal();
  }

  function openMembership(membershipValue: Membership | null) {
    setEditingMembership(membershipValue);
    setMembership(
      membershipValue
        ? toMembershipInput(membershipValue)
        : { ...EMPTY_MEMBERSHIP_INPUT, started_at: toLocalInputValue(now.toISOString()).slice(0, 10) },
    );
    setError(null);
    memberRef.current?.showModal();
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: entries.length },
    ...LOYALTY_ENTRY_KINDS.map((kind) => ({
      key: kind as Filter,
      label: kind === "redeem" ? "Redeemed" : kind.charAt(0).toUpperCase() + kind.slice(1),
      count: entries.filter((e) => e.kind === kind).length,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Members" value={String(summary.members)} hint="Holding at least one entry" />
        <StatCard
          label="Points outstanding"
          value={String(summary.pointsOutstanding)}
          hint={
            rules
              ? `worth ${formatMoney(summary.valueOutstanding, currencyCode)}`
              : "no programme configured"
          }
          tone="up"
        />
        <StatCard
          label="Redeemed"
          value={String(summary.pointsRedeemed)}
          hint="Spent at the counter"
        />
        <StatCard
          label="Lapsing in 30 days"
          value={String(expiring.points)}
          hint={expiring.points ? "Tell them before it goes" : "Nothing close to expiry"}
          tone={expiring.points > 0 ? "down" : "neutral"}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      {/* The programme itself */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">The programme</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              {rules ? (
                <>
                  {describeEarnRule(rules)} · a point is worth{" "}
                  {formatMoney(rules.point_value, currencyCode)} ·{" "}
                  {rules.expiry_days === null
                    ? "points never expire"
                    : `points expire after ${rules.expiry_days} ${pluralize(rules.expiry_days, "day")}`}{" "}
                  · redemption is{" "}
                  <span className="font-semibold">
                    {rules.redemption_enabled ? "on" : "switched off"}
                  </span>
                </>
              ) : (
                "This brand has no loyalty rules row yet, so points can only be logged by hand."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                setGrant({ ...EMPTY_GRANT_INPUT });
                grantRef.current?.showModal();
              }}
            >
              Add ledger entry
            </button>
            <button
              type="button"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={openRules}
            >
              Edit rules
            </button>
          </div>
        </div>

        {rules && rules.tiers.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {summary.byTier.map(({ tier, members }) => (
              <div
                key={tier.id}
                className="rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] p-3"
              >
                <p className="font-medium">{tier.name}</p>
                <p className="text-xs text-[var(--ob-text-muted)]">
                  from {formatMoney(tier.min_spend, currencyCode)} lifetime ·{" "}
                  {tier.discount_percent}% off
                </p>
                <p className="ob-num mt-1 text-lg font-semibold">{members}</p>
              </div>
            ))}
          </div>
        ) : null}

        {rules ? (
          <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
            Tiers unlock from lifetime spend, so a member moves up without anyone editing a
            record. Changing the rules never rewrites the ledger — the entries stay as logged.
          </p>
        ) : null}
      </Card>

      {expiring.entries.length ? (
        <Card className="p-4">
          <h2 className="font-semibold">Expiring within 30 days</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {expiring.entries.slice(0, 6).map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/customers/${entry.customer_id}`}
                  className="text-[var(--ob-primary)] hover:underline"
                >
                  {nameOf(entry.customer_id)}
                </Link>
                <span className="ob-num">
                  {entry.points} points · lapses {formatDate(entry.expires_at!)}
                </span>
              </li>
            ))}
          </ul>
          {expiring.entries.length > 6 ? (
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              +{expiring.entries.length - 6} more
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Balances */}
      <Card className="p-4">
        <h2 className="font-semibold">Balances</h2>
        {balances.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Nobody holds points yet.
          </p>
        ) : (
          <div className="mt-2 ob-scroll-x">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ob-line)]">
                  <th className="ob-label-quiet py-2 pr-3">Customer</th>
                  <th className="ob-label-quiet py-2 pr-3 text-right">Points</th>
                  <th className="ob-label-quiet py-2 pr-3 text-right">Worth</th>
                  <th className="ob-label-quiet py-2 pr-3">Tier reached</th>
                  <th className="ob-label-quiet py-2" />
                </tr>
              </thead>
              <tbody>
                {balances.slice(0, 12).map((row) => {
                  const profile = profiles.find((p) => p.customer.id === row.id);
                  const tier = rules ? tierById(rules, profile?.loyaltyTierId ?? null) : null;
                  return (
                    <tr key={row.id} className="border-b border-[var(--ob-line)] last:border-0">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/customers/${row.id}`}
                          className="text-[var(--ob-primary)] hover:underline"
                        >
                          {nameOf(row.id)}
                        </Link>
                      </td>
                      <td className="ob-num py-2 pr-3 text-right">{row.points}</td>
                      <td className="ob-num py-2 pr-3 text-right">
                        {rules ? formatMoney(pointsValue(rules, row.points), currencyCode) : "—"}
                      </td>
                      <td className="py-2 pr-3">{tier ? tier.name : "—"}</td>
                      <td className="py-2 text-right">
                        {rules?.redemption_enabled && row.points > 0 ? (
                          <button
                            type="button"
                            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                            disabled={pending}
                            onClick={() => {
                              setRedeem({
                                customer_id: row.id,
                                points: String(row.points),
                                reason: "",
                              });
                              setError(null);
                              redeemRef.current?.showModal();
                            }}
                          >
                            Redeem
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ledger */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the ledger">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                className={cn(
                  "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
                  filter === f.key
                    ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                    : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
                )}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
          <input
            className="ob-input w-full max-w-[16rem]"
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            placeholder="Search name or reason…"
            aria-label="Search the ledger"
          />
        </div>

        {ledgerShown.length === 0 ? (
          <EmptyState
            title="Nothing in the ledger"
            description="Every point granted, spent or corrected lands here with the reason next to it."
          />
        ) : (
          <ul className="space-y-2">
            {ledgerShown.map((entry) => (
              <li key={entry.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <Link
                        href={`/customers/${entry.customer_id}`}
                        className="text-[var(--ob-primary)] hover:underline"
                      >
                        {nameOf(entry.customer_id)}
                      </Link>
                      <Badge tone={ENTRY_TONE[entry.kind]} className="ml-2">
                        {entry.kind}
                      </Badge>
                      {isExpired(entry, now) ? (
                        <Badge tone="danger" className="ml-2">
                          Lapsed
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {entry.reason}
                      {entry.order_id ? ` · bill ${entry.order_id}` : ""} ·{" "}
                      {formatDate(entry.created_at)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "ob-num font-semibold",
                      entry.points < 0
                        ? "text-[var(--ob-danger)]"
                        : "text-[var(--ob-text)]",
                    )}
                  >
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {entries.length > 60 ? (
          <p className="text-xs text-[var(--ob-text-muted)]">
            Showing the 60 most recent of {entries.length} entries.
          </p>
        ) : null}
      </div>

      {/* Memberships */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Memberships</h2>
            <p className="text-xs text-[var(--ob-text-muted)]">
              Paid or invited membership sits beside points: a tier with its own start and
              end dates, not a spend level.
            </p>
          </div>
          <button
            type="button"
            className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            disabled={pending || !rules?.tiers.length}
            onClick={() => openMembership(null)}
          >
            New membership
          </button>
        </div>

        {memberships.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
            {rules?.tiers.length
              ? "Nobody is enrolled yet."
              : "Enrolment needs at least one tier in the programme."}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {memberships.map((membershipValue) => {
              const tier = rules ? tierById(rules, membershipValue.tier_id) : null;
              const lapsed =
                membershipValue.expires_at !== null &&
                new Date(membershipValue.expires_at) <= now;
              return (
                <li key={membershipValue.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <Link
                          href={`/customers/${membershipValue.customer_id}`}
                          className="text-[var(--ob-primary)] hover:underline"
                        >
                          {nameOf(membershipValue.customer_id)}
                        </Link>
                        <Badge
                          tone={
                            membershipValue.status === "active" && !lapsed
                              ? "success"
                              : membershipValue.status === "cancelled"
                                ? "danger"
                                : "neutral"
                          }
                          className="ml-2"
                        >
                          {lapsed && membershipValue.status === "active"
                            ? "Past its date"
                            : MEMBERSHIP_LABELS[membershipValue.status]}
                        </Badge>
                      </p>
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {tier ? tier.name : membershipValue.tier_id} · since{" "}
                        {formatDate(membershipValue.started_at)}
                        {membershipValue.expires_at
                          ? ` · until ${formatDate(membershipValue.expires_at)}`
                          : " · no end date"}
                        {membershipValue.notes ? ` · ${membershipValue.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {MEMBERSHIP_STATUSES.filter((s) => s !== membershipValue.status).map(
                        (status) => (
                          <button
                            key={status}
                            type="button"
                            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                            disabled={pending}
                            onClick={() =>
                              run(() => setMembershipStatusAction(membershipValue.id, status))
                            }
                          >
                            {status === "active" ? "Reinstate" : MEMBERSHIP_LABELS[status]}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                        disabled={pending}
                        onClick={() => openMembership(membershipValue)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-xs font-semibold text-[var(--ob-danger)] disabled:opacity-50"
                        disabled={pending}
                        onClick={() => run(() => deleteMembershipAction(membershipValue.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Rules editor */}
      <dialog
        ref={rulesRef}
        className="m-auto max-h-[90vh] w-[min(100%,40rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveLoyaltyRulesAction(rulesForm));
            if (ok) rulesRef.current?.close();
          }}
        >
          <h2 className="font-semibold">Programme rules</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            The whole programme is data. Change it and the balances, tiers and expiry dates
            on every screen follow — the ledger rows you already logged are left alone.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Points are earned</span>
              <select
                className="ob-input mt-1 w-full"
                value={rulesForm.earn_mode}
                onChange={(e) =>
                  setRulesForm((prev) => ({ ...prev, earn_mode: e.target.value }))
                }
                disabled={pending}
              >
                <option value="per_amount">Per amount spent</option>
                <option value="per_order">Per completed bill</option>
              </select>
            </label>
            {rulesForm.earn_mode === "per_amount" ? (
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Money that earns one point</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min={0}
                  step={1}
                  value={rulesForm.earn_amount_per_point}
                  onChange={(e) =>
                    setRulesForm((prev) => ({
                      ...prev,
                      earn_amount_per_point: e.target.value,
                    }))
                  }
                  disabled={pending}
                />
              </label>
            ) : (
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Points per bill</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min={0}
                  step={1}
                  value={rulesForm.earn_points_per_order}
                  onChange={(e) =>
                    setRulesForm((prev) => ({
                      ...prev,
                      earn_points_per_order: e.target.value,
                    }))
                  }
                  disabled={pending}
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Value of one point</span>
              <input
                className="ob-input mt-1 w-full"
                type="number"
                min={0}
                step="0.01"
                value={rulesForm.point_value}
                onChange={(e) =>
                  setRulesForm((prev) => ({ ...prev, point_value: e.target.value }))
                }
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">
                Days before points lapse (blank = never)
              </span>
              <input
                className="ob-input mt-1 w-full"
                type="number"
                min={1}
                step={1}
                value={rulesForm.expiry_days}
                onChange={(e) =>
                  setRulesForm((prev) => ({ ...prev, expiry_days: e.target.value }))
                }
                disabled={pending}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={rulesForm.redemption_enabled === "yes"}
              onChange={(e) =>
                setRulesForm((prev) => ({
                  ...prev,
                  redemption_enabled: e.target.checked ? "yes" : "no",
                }))
              }
              disabled={pending}
            />
            <span>
              Let points be spent at the counter
              <span className="block text-xs text-[var(--ob-text-muted)]">
                Switched off, balances still accrue and show, but the Redeem button disappears.
              </span>
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">
              Tiers — one per line: name, lifetime spend to reach, discount %
            </span>
            <textarea
              className="ob-input mt-1 w-full font-mono text-xs"
              rows={5}
              value={rulesForm.tiers}
              onChange={(e) => setRulesForm((prev) => ({ ...prev, tiers: e.target.value }))}
              disabled={pending}
              placeholder={"Silver, 5000, 5\nGold, 20000, 10"}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save the programme"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => rulesRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      {/* Ledger entry */}
      <dialog
        ref={grantRef}
        className="m-auto max-h-[90vh] w-[min(100%,34rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => grantLoyaltyPointsAction(grant));
            if (ok) grantRef.current?.close();
          }}
        >
          <h2 className="font-semibold">Ledger entry</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            Saving a bill does not mint points on this build — the ledger holds what has been
            awarded, each earn row against its bill. This entry is for the rest: a bonus, a
            correction, a goodwill top-up.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer</span>
              <select
                className="ob-input mt-1 w-full"
                value={grant.customer_id}
                onChange={(e) => setGrant((prev) => ({ ...prev, customer_id: e.target.value }))}
                required
                disabled={pending}
              >
                <option value="">Choose…</option>
                {profiles.map((profile) => (
                  <option key={profile.customer.id} value={profile.customer.id}>
                    {profile.customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Kind</span>
              <select
                className="ob-input mt-1 w-full"
                value={grant.kind}
                onChange={(e) => setGrant((prev) => ({ ...prev, kind: e.target.value }))}
                disabled={pending}
              >
                {GRANT_KINDS.map((kind: GrantKind) => (
                  <option key={kind} value={kind}>
                    {GRANT_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">
                Points {grant.kind !== "adjust" && grant.kind !== "expire" ? "(added)" : ""}
              </span>
              <input
                className="ob-input mt-1 w-full"
                type="number"
                step={1}
                value={grant.points}
                onChange={(e) => setGrant((prev) => ({ ...prev, points: e.target.value }))}
                required
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Bill (optional)</span>
              <select
                className="ob-input mt-1 w-full"
                value={grant.order_id}
                onChange={(e) => setGrant((prev) => ({ ...prev, order_id: e.target.value }))}
                disabled={pending}
              >
                <option value="">Not tied to a bill</option>
                {bills.map((bill) => (
                  <option key={bill.id} value={bill.id}>
                    {bill.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--ob-text-muted)]">Why</span>
              <input
                className="ob-input mt-1 w-full"
                value={grant.reason}
                onChange={(e) => setGrant((prev) => ({ ...prev, reason: e.target.value }))}
                maxLength={200}
                required
                disabled={pending}
                placeholder="Loyalty bonus for the Diwali order…"
              />
            </label>
          </div>

          <p className="text-xs text-[var(--ob-text-muted)]">
            {grant.kind === "expire"
              ? "Entered as a positive number; the ledger stores it as a removal."
              : grant.kind === "adjust"
                ? "A correction can go either way — a negative number takes points off."
                : "The sign is decided by the kind, never by the keypad."}
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Write to the ledger"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => grantRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      {/* Redeem */}
      <dialog
        ref={redeemRef}
        className="m-auto max-h-[90vh] w-[min(100%,28rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              redeemLoyaltyPointsAction({
                customer_id: redeem.customer_id,
                points: redeem.points,
                reason: redeem.reason,
              }),
            );
            if (ok) redeemRef.current?.close();
          }}
        >
          <h2 className="font-semibold">Redeem points</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            {nameOf(redeem.customer_id)} holds{" "}
            <span className="ob-num font-semibold text-[var(--ob-text)]">
              {redeemBalance}
            </span>{" "}
            points
            {rules
              ? ` — worth ${formatMoney(pointsValue(rules, redeemBalance), currencyCode)} at this programme's value.`
              : "."}
          </p>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Points to spend</span>
            <input
              className="ob-input mt-1 w-full"
              type="number"
              min={1}
              step={1}
              value={redeem.points}
              onChange={(e) => setRedeem((prev) => ({ ...prev, points: e.target.value }))}
              required
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">What for</span>
            <input
              className="ob-input mt-1 w-full"
              value={redeem.reason}
              onChange={(e) => setRedeem((prev) => ({ ...prev, reason: e.target.value }))}
              maxLength={200}
              disabled={pending}
              placeholder="Adjusted against the bill at the counter"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Redeem"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => redeemRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      {/* Membership editor */}
      <dialog
        ref={memberRef}
        className="m-auto max-h-[90vh] w-[min(100%,34rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveMembershipAction(editingMembership?.id ?? null, membership),
            );
            if (ok) {
              memberRef.current?.close();
              setEditingMembership(null);
            }
          }}
        >
          <h2 className="font-semibold">
            {editingMembership ? "Edit membership" : "New membership"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer</span>
              <select
                className="ob-input mt-1 w-full"
                value={membership.customer_id}
                onChange={(e) =>
                  setMembership((prev) => ({ ...prev, customer_id: e.target.value }))
                }
                required
                disabled={pending || editingMembership !== null}
              >
                <option value="">Choose…</option>
                {profiles.map((profile) => (
                  <option key={profile.customer.id} value={profile.customer.id}>
                    {profile.customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Tier</span>
              <select
                className="ob-input mt-1 w-full"
                value={membership.tier_id}
                onChange={(e) =>
                  setMembership((prev) => ({ ...prev, tier_id: e.target.value }))
                }
                required
                disabled={pending}
              >
                <option value="">Choose…</option>
                {rules?.tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Started</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={membership.started_at}
                onChange={(e) =>
                  setMembership((prev) => ({ ...prev, started_at: e.target.value }))
                }
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">
                Expires (blank = open-ended)
              </span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={membership.expires_at}
                onChange={(e) =>
                  setMembership((prev) => ({ ...prev, expires_at: e.target.value }))
                }
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Status</span>
              <select
                className="ob-input mt-1 w-full"
                value={membership.status}
                onChange={(e) =>
                  setMembership((prev) => ({ ...prev, status: e.target.value }))
                }
                disabled={pending}
              >
                {MEMBERSHIP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {MEMBERSHIP_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Note</span>
              <input
                className="ob-input mt-1 w-full"
                value={membership.notes}
                onChange={(e) => setMembership((prev) => ({ ...prev, notes: e.target.value }))}
                maxLength={300}
                disabled={pending}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : editingMembership ? "Save changes" : "Enrol"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => memberRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
