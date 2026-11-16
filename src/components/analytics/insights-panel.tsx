"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import {
  INSIGHT_KIND_LABELS,
  type Insight,
  type InsightSeverity,
} from "@/lib/analytics/insights";

const SEVERITY_TONE: Record<
  InsightSeverity,
  { badge: "danger" | "warning" | "success" | "neutral"; stat: "up" | "down" | "neutral"; label: string }
> = {
  critical: { badge: "danger", stat: "down", label: "Needs action" },
  warning: { badge: "warning", stat: "down", label: "Watch" },
  positive: { badge: "success", stat: "up", label: "Healthy" },
  info: { badge: "neutral", stat: "neutral", label: "Note" },
};

/**
 * Deterministic readings of the current range, each pointing at the module
 * that can change it. Numbers are produced in `lib/analytics/insights.ts`;
 * this panel only presents them.
 */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return (
      <EmptyState
        title="No insights for this range yet"
        description="Insights compare this period with the one before it, so they appear once there are orders, payments or expenses in the window."
      />
    );
  }

  const headline = insights.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {headline.map((insight) => (
          <StatCard
            key={insight.id}
            label={insight.metric.label}
            value={insight.metric.value}
            hint={INSIGHT_KIND_LABELS[insight.kind]}
            tone={SEVERITY_TONE[insight.severity].stat}
          />
        ))}
      </div>

      <ul className="space-y-3">
        {insights.map((insight) => {
          const tone = SEVERITY_TONE[insight.severity];
          return (
            <li key={insight.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone.badge}>{tone.label}</Badge>
                    <Badge>{INSIGHT_KIND_LABELS[insight.kind]}</Badge>
                  </div>
                  <span className="text-sm font-semibold text-[var(--ob-text-secondary)]">
                    {insight.metric.label}: {insight.metric.value}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{insight.headline}</h3>
                <p className="mt-1 max-w-3xl text-sm text-[var(--ob-text-muted)]">
                  {insight.detail}
                </p>
                {insight.actionHref ? (
                  <Link
                    href={insight.actionHref}
                    className="mt-3 inline-flex text-xs font-medium text-[var(--ob-primary)] hover:underline"
                  >
                    {insight.actionLabel ?? "Open"}
                  </Link>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
