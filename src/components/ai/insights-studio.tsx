"use client";

import { PageShell } from "@/components/workspace/page-shell";
import { AiInsightsPanel } from "@/components/ai/ai-insights-panel";
import type { AiInsightData } from "@/lib/ai/insights";

/**
 * The AI Insights workspace screen.
 *
 * Its own route rather than a tab inside Analytics: the briefs read fixed
 * windows (the last calendar month, the rolling seven days, a 30- or 90-day
 * slice) over every row the brand holds, which is a different question from
 * "chart the range I picked", and the row set they need only has to be loaded —
 * and shipped to the client — while this page is open.
 */
export function InsightsStudio({ data }: { data: AiInsightData }) {
  return (
    <PageShell title="AI Insights">
      <div className="space-y-4">
        <p className="max-w-3xl text-sm text-[var(--ob-text-muted)]">
          Four summaries up top, nine narrower briefs below. Each one reads its
          own fixed window — the last calendar month, the rolling seven days, a
          30- or 90-day slice — over every row in this workspace, so the range
          picker on Analytics does not change these answers.
        </p>
        <AiInsightsPanel data={data} />
      </div>
    </PageShell>
  );
}
