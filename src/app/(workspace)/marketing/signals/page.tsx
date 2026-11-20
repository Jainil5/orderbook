import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { MarketingSubnav } from "@/components/marketing/marketing-subnav";
import { GrowthSignalsPanel } from "@/components/marketing/growth-signals";
import { loadCrmWorkspace } from "@/lib/crm/data";
import {
  listDemoOrderItemsForOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { buildGrowthSignals } from "@/lib/marketing/signals";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const WINDOWS = [7, 30, 90] as const;

function windowDays(value: string | undefined): number {
  const parsed = Number(value);
  return (WINDOWS as readonly number[]).includes(parsed) ? parsed : 30;
}

/**
 * One read of everything the signal board needs. It lives outside the page
 * because `buildGrowthSignals` wants the moment the window is measured from,
 * and a component is not allowed to ask the clock what time it is.
 */
async function loadSignals(code: DemoBrandCode, days: number) {
  const [workspace, products, orderItems] = await Promise.all([
    loadCrmWorkspace(code),
    listDemoProductsMerged(undefined, code),
    listDemoOrderItemsForOrders(code),
  ]);

  return {
    currencyCode: workspace.currencyCode,
    signals: buildGrowthSignals({
      now: Date.now(),
      windowDays: days,
      products,
      orders: workspace.orders,
      orderItems,
      interactions: workspace.interactions,
      reviews: workspace.reviews,
      complaints: workspace.complaints,
      campaigns: workspace.campaigns,
    }),
  };
}

export default async function GrowthSignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  const days = windowDays((await searchParams).window);
  const { signals, currencyCode } = await loadSignals(code, days);

  return (
    <PageShell title="Growth Signals">
      <MarketingSubnav activeHref="/marketing/signals" />
      <GrowthSignalsPanel
        signals={signals}
        currencyCode={currencyCode}
        activeWindow={days}
      />
    </PageShell>
  );
}
