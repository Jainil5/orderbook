"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  TIMELINE_EVENT_KINDS,
  type TimelineCounts,
  type TimelineEventKind,
} from "@/lib/crm/timeline";

const KIND_LABELS: Record<TimelineEventKind, string> = {
  bill: "Bills",
  payment: "Payments",
  interaction: "Interactions",
  review: "Reviews",
  complaint: "Complaints",
  loyalty: "Points",
  membership: "Memberships",
  lead: "Enquiry",
  account: "Account",
};

/**
 * The 360 filter is URL state, like the directory: the stream itself is drawn
 * on the server from the same rows the modules write, so filtering cannot make
 * the page disagree with what Billing or the CRM holds.
 */
export function TimelineFilters({
  counts,
  active,
  basePath,
}: {
  counts: TimelineCounts;
  active: TimelineEventKind[];
  /** This record's own route, so the pills can rewrite only the query. */
  basePath: string;
}) {
  const router = useRouter();

  function toggle(kind: TimelineEventKind) {
    const next = active.includes(kind)
      ? active.filter((k) => k !== kind)
      : [...active, kind];
    const query = next.map((k) => `kind=${encodeURIComponent(k)}`).join("&");
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the timeline">
      <button
        type="button"
        aria-pressed={active.length === 0}
        className={cn(
          "ob-press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
          active.length === 0
            ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
            : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
        )}
        onClick={() => router.push(basePath, { scroll: false })}
      >
        Everything
      </button>
      {TIMELINE_EVENT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={active.includes(kind)}
          disabled={counts[kind] === 0 && !active.includes(kind)}
          className={cn(
            "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-40",
            active.includes(kind)
              ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
              : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
          )}
          onClick={() => toggle(kind)}
        >
          {KIND_LABELS[kind]}
          <span className="tabular-nums opacity-70">{counts[kind]}</span>
        </button>
      ))}
    </div>
  );
}
