import { InsightsStudio } from "@/components/ai/insights-studio";
import type { AiInsightData } from "@/lib/ai/insights";
import { calendarDateInZone } from "@/lib/analytics/date-range";
import { loadDemoCrm } from "@/lib/crm/data";
import {
  demoInventorySnapshot,
  listDemoCustomers,
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoPayments,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

/** Consumption window the stock brief measures runway against. */
const AI_USAGE_DAYS = 7;

export default async function InsightsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  // The briefs read fixed windows over the brand's whole history, not a picked
  // range, so this page loads the unfiltered row set once and hands it down.
  const [orders, items, products, payments, customers, crm, inventory] =
    await Promise.all([
      listDemoOrders(undefined, code),
      listDemoOrderItemsForOrders(code),
      listDemoProductsMerged({}, code),
      listDemoPayments(code),
      listDemoCustomers(undefined, code),
      loadDemoCrm(code),
      demoInventorySnapshot(code, AI_USAGE_DAYS),
    ]);

  const data: AiInsightData = {
    brandName: ws.brand.name,
    currencyCode: ws.settings.currency_code,
    today: calendarDateInZone(new Date()),
    orders,
    items,
    products,
    payments,
    customers,
    reviews: crm.reviews,
    positions: inventory.positions,
    usage: inventory.usage,
    usageWindowDays: inventory.windowDays,
  };

  return <InsightsStudio data={data} />;
}
