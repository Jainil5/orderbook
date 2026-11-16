"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  EMPTY_SEGMENT_RULE_INPUT,
  describeRules,
  manualMemberIds,
  segmentMemberIds,
  segmentRulesFromInput,
  segmentRulesToInput,
  type SegmentRuleInput,
} from "@/lib/crm/segments";
import type { CustomerProfile } from "@/lib/crm/metrics";
import { saveSegmentAction, deleteSegmentAction } from "@/services/crm-actions";
import type { CustomerSegment } from "@/types/crm";

type Option = { id: string; name: string };

const NUMBER_FIELDS: { key: keyof SegmentRuleInput; label: string; hint: string }[] = [
  { key: "minOrders", label: "At least N bills", hint: "completed bills" },
  { key: "maxOrders", label: "At most N bills", hint: "completed bills" },
  { key: "minSpend", label: "Lifetime spend from", hint: "rupees" },
  { key: "maxSpend", label: "Lifetime spend up to", hint: "rupees" },
  { key: "inactiveDays", label: "Quiet for at least N days", hint: "days since the last bill" },
  { key: "activeWithinDays", label: "Bought within N days", hint: "days" },
  { key: "joinedWithinDays", label: "Joined within N days", hint: "days" },
  { key: "minRating", label: "Rating from", hint: "1–5 stars" },
  { key: "maxRating", label: "Rating up to", hint: "1–5 stars" },
  { key: "minLoyaltyPoints", label: "Points from", hint: "live points" },
];

const YES_NO = [
  { id: "", label: "Either" },
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

/**
 * A segment is a saved question, not a saved answer: dynamic ones store rules
 * and recompute membership from live bills, so the list is right tomorrow
 * without anyone re-running it. Manual ones are a deliberate shortlist.
 */
export function SegmentsManager({
  segments,
  profiles,
  loyaltyTiers,
  universe,
}: {
  segments: CustomerSegment[];
  profiles: CustomerProfile[];
  loyaltyTiers: Option[];
  universe: { tags: string[]; sources: string[]; priceTiers: string[] };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerSegment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"dynamic" | "manual">("dynamic");
  const [rules, setRules] = useState<SegmentRuleInput>(EMPTY_SEGMENT_RULE_INPUT);
  const [members, setMembers] = useState<string[]>([]);

  const byId = new Map(profiles.map((p) => [p.customer.id, p]));

  function memberIdsOf(segment: CustomerSegment): string[] {
    return segment.kind === "manual"
      ? manualMemberIds(segment.member_ids, profiles)
      : segmentMemberIds(segment.rules ?? {}, profiles);
  }

  function startEdit(segment: CustomerSegment | null) {
    setEditing(segment);
    setName(segment?.name ?? "");
    setDescription(segment?.description ?? "");
    setKind(segment?.kind ?? "dynamic");
    setRules(segment ? segmentRulesToInput(segment.rules) : EMPTY_SEGMENT_RULE_INPUT);
    setMembers(segment?.member_ids ?? []);
    setError(null);
  }

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      saveSegmentAction(editing?.id ?? null, {
        name,
        description,
        kind,
        member_ids: members,
        rules,
      }),
    );
    if (ok) {
      dialogRef.current?.close();
      startEdit(null);
    }
  }

  const { rules: previewRules, error: previewError } = segmentRulesFromInput(rules);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ob-text-muted)]">
          <span className="ob-num font-medium text-[var(--ob-text)]">{segments.length}</span>{" "}
          saved {segments.length === 1 ? "view" : "views"} · membership counted from live data
        </p>
        <button
          type="button"
          className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            startEdit(null);
            dialogRef.current?.showModal();
          }}
        >
          New segment
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      {segments.length === 0 ? (
        <EmptyState
          title="No saved segments"
          description="A segment is a set of rules you keep — repeat buyers, dues outstanding, quiet for 90 days — that recomputes itself every time you open it."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {segments.map((segment) => {
            const ids = memberIdsOf(segment);
            const emptyRules = segment.kind === "dynamic" && !segment.rules;
            return (
              <Card key={segment.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {segment.name}
                      <Badge
                        tone={segment.kind === "dynamic" ? "success" : "neutral"}
                        className="ml-2"
                      >
                        {segment.kind === "dynamic" ? "Live rules" : "Hand-picked"}
                      </Badge>
                    </p>
                    {segment.description ? (
                      <p className="text-sm text-[var(--ob-text-muted)]">{segment.description}</p>
                    ) : null}
                  </div>
                  <p className="ob-num text-2xl font-semibold">{ids.length}</p>
                </div>

                <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
                  {segment.kind === "manual"
                    ? `${ids.length} of ${profiles.length} on the list`
                    : emptyRules
                      ? "No rules yet — this matches everyone."
                      : describeRules(segment.rules ?? {})}
                </p>

                {ids.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ids.slice(0, 6).map((id) => (
                      <Link
                        key={id}
                        href={`/customers/${id}`}
                        className="ob-tag ob-tag-leaf"
                      >
                        {byId.get(id)?.customer.name ?? "Unknown"}
                      </Link>
                    ))}
                    {ids.length > 6 ? (
                      <span className="text-xs text-[var(--ob-text-muted)]">
                        +{ids.length - 6} more
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--ob-warning)]">
                    Nothing matches right now. A live segment fills itself as soon as a bill does.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/customers/directory?segment=${segment.id}`}
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
                  >
                    Open in directory
                  </Link>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      startEdit(segment);
                      dialogRef.current?.showModal();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => run(() => deleteSegmentAction(segment.id))}
                  >
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(100%,44rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form className="space-y-4 p-5" onSubmit={onSubmit}>
          <h2 className="font-semibold">{editing ? "Edit segment" : "New segment"}</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input
                className="ob-input mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Why (optional)</span>
              <input
                className="ob-input mt-1 w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                disabled={pending}
              />
            </label>
          </div>

          <fieldset className="space-y-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
            <legend className="px-1 text-sm text-[var(--ob-text-muted)]">
              How it stays up to date
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="segment-kind"
                checked={kind === "dynamic"}
                onChange={() => setKind("dynamic")}
                disabled={pending}
              />
              <span>
                Live rules
                <span className="block text-xs text-[var(--ob-text-muted)]">
                  Membership is recomputed from the bills every time the page opens.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="segment-kind"
                checked={kind === "manual"}
                onChange={() => setKind("manual")}
                disabled={pending}
              />
              <span>
                Hand-picked list
                <span className="block text-xs text-[var(--ob-text-muted)]">
                  Stays exactly as you left it, minus anyone deleted or archived.
                </span>
              </span>
            </label>
          </fieldset>

          {kind === "dynamic" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NUMBER_FIELDS.map((field) => (
                  <label key={field.key} className="block text-sm">
                    <span className="text-[var(--ob-text-muted)]">{field.label}</span>
                    <input
                      className="ob-input mt-1 w-full"
                      type="number"
                      min={0}
                      value={rules[field.key]}
                      onChange={(e) =>
                        setRules((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.hint}
                      disabled={pending}
                    />
                  </label>
                ))}
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Price list</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={rules.priceTier}
                    onChange={(e) => setRules((prev) => ({ ...prev, priceTier: e.target.value }))}
                    disabled={pending}
                  >
                    <option value="">Any</option>
                    {universe.priceTiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Acquisition source</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={rules.source}
                    onChange={(e) => setRules((prev) => ({ ...prev, source: e.target.value }))}
                    disabled={pending}
                  >
                    <option value="">Any</option>
                    {universe.sources.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Loyalty tier</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={rules.loyaltyTier}
                    onChange={(e) => setRules((prev) => ({ ...prev, loyaltyTier: e.target.value }))}
                    disabled={pending}
                  >
                    <option value="">Any</option>
                    {loyaltyTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Owing money</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={rules.hasOutstandingDues}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, hasOutstandingDues: e.target.value }))
                    }
                    disabled={pending}
                  >
                    {YES_NO.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Open complaint</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={rules.hasOpenComplaints}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, hasOpenComplaints: e.target.value }))
                    }
                    disabled={pending}
                  >
                    {YES_NO.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2 lg:col-span-3">
                  <span className="text-[var(--ob-text-muted)]">Tags (all of them must match)</span>
                  <input
                    className="ob-input mt-1 w-full"
                    value={rules.tags}
                    onChange={(e) => setRules((prev) => ({ ...prev, tags: e.target.value }))}
                    placeholder="trade, repeat"
                    disabled={pending}
                  />
                </label>
              </div>
              {previewError ? (
                <p className="text-sm text-[var(--ob-danger)]">{previewError}</p>
              ) : previewRules ? (
                <p className="text-sm text-[var(--ob-text-muted)]">
                  Matches{" "}
                  <span className="ob-num font-medium text-[var(--ob-text)]">
                    {segmentMemberIds(previewRules, profiles).length}
                  </span>{" "}
                  of {profiles.length} customers right now —{" "}
                  {describeRules(previewRules) || "no rules filled in yet"}
                </p>
              ) : null}
            </>
          ) : (
            <fieldset className="space-y-1 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
              <legend className="px-1 text-sm text-[var(--ob-text-muted)]">
                People on this list ({members.length})
              </legend>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {profiles.map((profile) => (
                  <label key={profile.customer.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={members.includes(profile.customer.id)}
                      onChange={(e) =>
                        setMembers((prev) =>
                          e.target.checked
                            ? [...prev, profile.customer.id]
                            : prev.filter((id) => id !== profile.customer.id),
                        )
                      }
                      disabled={pending}
                    />
                    {profile.customer.name}
                    <span className="text-xs text-[var(--ob-text-muted)]">
                      {profile.customer.phone ?? profile.customer.email ?? ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Create segment"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
