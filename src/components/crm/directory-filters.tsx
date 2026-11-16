"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { segmentRulesToInput } from "@/lib/crm/segments";
import {
  directoryToParams,
  HEALTH_FILTER_LABELS,
  HEALTH_FILTERS,
  SORT_KEYS,
  SORT_LABELS,
  type DirectoryState,
  type HealthFilter,
  type SortKey,
} from "@/lib/crm/directory";
import { saveSegmentAction } from "@/services/crm-actions";

/**
 * The directory's filters live in the URL, not in component state: a filtered
 * view is then linkable, survives a refresh, and is the same object a saved
 * segment stores. One mechanism, two features.
 */

type NumberRuleField = {
  key: "minOrders" | "minSpend" | "inactiveDays" | "joinedWithinDays" | "minLoyaltyPoints";
  label: string;
  hint: string;
  step?: number;
};

const NUMBER_RULE_FIELDS: NumberRuleField[] = [
  { key: "minOrders", label: "Bills", hint: "at least this many completed bills" },
  { key: "minSpend", label: "Lifetime spend", hint: "at least this much, in rupees" },
  { key: "inactiveDays", label: "Quiet for", hint: "days since the last bill" },
  { key: "joinedWithinDays", label: "Joined within", hint: "days since they were added" },
  { key: "minLoyaltyPoints", label: "Points", hint: "at least this many live points" },
];

const YES_NO = [
  { id: "", label: "Any" },
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export function DirectoryFilters({
  state,
  segments,
  segmentId,
  universe,
  loyaltyTiers,
  total,
}: {
  state: DirectoryState;
  segments: { id: string; name: string; count: number }[];
  segmentId: string | null;
  universe: { tags: string[]; sources: string[]; priceTiers: string[] };
  loyaltyTiers: { id: string; name: string }[];
  total: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState(state.q);

  // The URL is the source of truth, so a back button or a saved link has to
  // pull the typed term back in.
  const [prevQuery, setPrevQuery] = useState(state.q);
  if (prevQuery !== state.q) {
    setPrevQuery(state.q);
    setQuery(state.q);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim() === state.q) return;
      apply({ q: query.trim(), page: 1 });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function apply(next: Partial<DirectoryState> & { segment?: string | null }) {
    const merged: DirectoryState = { ...state, ...next };
    const search = new URLSearchParams(directoryToParams(merged));
    const segment = "segment" in next ? next.segment : segmentId;
    if (segment) search.set("segment", segment);
    const qs = search.toString();
    router.push(qs ? `/customers/directory?${qs}` : "/customers/directory");
  }

  function toggleTag(tag: string) {
    const current = state.rules.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    apply({ rules: { ...state.rules, tags: next.length ? next : undefined }, page: 1 });
  }

  async function saveAsSegment() {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveSegmentAction(null, {
        name,
        description,
        kind: "dynamic",
        member_ids: [],
        rules: segmentRulesToInput(state.rules),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      dialogRef.current?.close();
      setName("");
      setDescription("");
      setNotice("Segment saved — it is in the list and will recompute itself.");
      router.refresh();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  const filtersOn =
    Object.keys(state.rules).length > 0 ||
    state.health !== "all" ||
    state.q !== "" ||
    segmentId !== null;

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-sm">
            <span className="text-[var(--ob-text-muted)]">Search</span>
            <input
              className="ob-input mt-1 w-full"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, phone, email, address or tag"
              aria-label="Search customers"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Sort by</span>
            <select
              className="ob-input mt-1 w-full"
              value={state.sort}
              onChange={(e) => apply({ sort: e.target.value as SortKey })}
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-2 text-sm font-semibold"
            onClick={() =>
              apply({ direction: state.direction === "asc" ? "desc" : "asc" })
            }
          >
            {state.direction === "asc" ? "Ascending ↑" : "Descending ↓"}
          </button>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Saved segment</span>
            <select
              className="ob-input mt-1 w-full"
              value={segmentId ?? ""}
              onChange={(e) => apply({ segment: e.target.value || null, page: 1 })}
            >
              <option value="">None</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {HEALTH_FILTERS.map((key: HealthFilter) => (
            <button
              key={key}
              type="button"
              className={`ob-touch-target rounded-full border px-3 text-sm ${
                state.health === key
                  ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)]"
                  : "border-[var(--ob-border)]"
              }`}
              onClick={() => apply({ health: key, page: 1 })}
            >
              {HEALTH_FILTER_LABELS[key]}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
          <span className="ob-num font-medium text-[var(--ob-text)]">{total}</span>{" "}
          {total === 1 ? "customer" : "customers"} match
          {filtersOn ? (
            <button
              type="button"
              className="ml-2 text-[var(--ob-primary)] hover:underline"
              onClick={() => router.push("/customers/directory")}
            >
              Clear filters
            </button>
          ) : null}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="ob-label-quiet">Rules</h2>
          <button
            type="button"
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
            onClick={() => dialogRef.current?.showModal()}
            disabled={Object.keys(state.rules).length === 0}
          >
            Save these rules as a segment
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {NUMBER_RULE_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">{field.label}</span>
              <input
                key={`${field.key}-${state.rules[field.key] ?? ""}`}
                className="ob-input mt-1 w-full"
                type="number"
                min={0}
                step={field.step}
                defaultValue={state.rules[field.key] ?? ""}
                placeholder={field.hint}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  apply({
                    rules: { ...state.rules, [field.key]: value ? Number(value) : undefined },
                    page: 1,
                  });
                }}
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Price list</span>
            <select
              className="ob-input mt-1 w-full"
              value={state.rules.priceTier ?? ""}
              onChange={(e) =>
                apply({
                  rules: { ...state.rules, priceTier: (e.target.value || undefined) as "retail" | "wholesale" | undefined },
                  page: 1,
                })
              }
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
              value={state.rules.source ?? ""}
              onChange={(e) =>
                apply({ rules: { ...state.rules, source: e.target.value || undefined }, page: 1 })
              }
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
            <span className="text-[var(--ob-text-muted)]">Owing money</span>
            <select
              className="ob-input mt-1 w-full"
              value={
                state.rules.hasOutstandingDues === undefined
                  ? ""
                  : state.rules.hasOutstandingDues
                    ? "yes"
                    : "no"
              }
              onChange={(e) => {
                const value = e.target.value;
                apply({
                  rules: {
                    ...state.rules,
                    hasOutstandingDues: value === "" ? undefined : value === "yes",
                  },
                  page: 1,
                });
              }}
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
              value={
                state.rules.hasOpenComplaints === undefined
                  ? ""
                  : state.rules.hasOpenComplaints
                    ? "yes"
                    : "no"
              }
              onChange={(e) => {
                const value = e.target.value;
                apply({
                  rules: {
                    ...state.rules,
                    hasOpenComplaints: value === "" ? undefined : value === "yes",
                  },
                  page: 1,
                });
              }}
            >
              {YES_NO.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Loyalty tier</span>
            <select
              className="ob-input mt-1 w-full"
              value={state.rules.loyaltyTier ?? ""}
              onChange={(e) =>
                apply({
                  rules: { ...state.rules, loyaltyTier: e.target.value || undefined },
                  page: 1,
                })
              }
            >
              <option value="">Any</option>
              {loyaltyTiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {universe.tags.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--ob-text-muted)]">Tags</span>
            {universe.tags.map((tag) => {
              const on = state.rules.tags?.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`ob-touch-target rounded-full border px-3 py-1 text-sm ${
                    on
                      ? "border-[var(--ob-primary)] bg-[var(--ob-tint-wash)] text-[var(--ob-primary)]"
                      : "border-[var(--ob-border)] text-[var(--ob-text-secondary)]"
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        ) : null}
      </Card>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(100%,28rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAsSegment();
          }}
        >
          <h2 className="font-semibold">Save this view as a segment</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            A dynamic segment stores the rules, not the people, so it is right again
            tomorrow without anyone re-running it.
          </p>
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
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save segment"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      {notice ? (
        <p className="text-sm text-[var(--ob-success)]">
          {notice}{" "}
          <Link href="/customers/segments" className="text-[var(--ob-primary)] hover:underline">
            Open Segments
          </Link>
        </p>
      ) : null}
    </div>
  );
}
