import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { RefundsPanel } from "@/components/manager/finance/refunds-panel";
import { RangeSelector } from "@/components/workspace/range-selector";
import { PageShell } from "@/components/workspace/page-shell";
import { orderInCalendarRange, resolveRange } from "@/lib/analytics/date-range";
import { refundRows } from "@/lib/business/cash";
import {
  listDemoOrders,
  listDemoPayments,
  listDemoRefunds,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { listOrders, listPayments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Order, Payment, Refund } from "@/types/database";

export default async function FinanceRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("refunds")) redirect("/manager/finance");

  const range = resolveRange(await searchParams, "all");
  const currency = ws.settings.currency_code;

  let orders: Order[] = [];
  let payments: Payment[] = [];
  let refunds: Refund[] = [];
  let error: string | null = null;
  let note: string | undefined;

  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    [orders, payments, refunds] = await Promise.all([
      listDemoOrders(undefined, code),
      listDemoPayments(code),
      // Refunds are their own CSV table now, so this is every refund the app
      // recorded plus any row an owner added to refunds.csv by hand.
      listDemoRefunds(code),
    ]);
  } else {
    const [ordersRes, paymentsRes] = await Promise.all([
      listOrders({ page: 1, pageSize: 100 }),
      listPayments(),
    ]);
    orders = ordersRes.data;
    payments = paymentsRes.data;
    error = ordersRes.error ?? paymentsRes.error ?? null;
    // The live data service exposes payments but not the refunds table, so a
    // live workspace only sees refunds that were actually paid out.
    note =
      "Live workspaces read refunds from the payment records on an order; the refunds table is not exposed by the live data service yet, so a request that has not been paid out may not appear here.";
  }

  const rows = refundRows(refunds, payments, orders).filter((row) =>
    orderInCalendarRange(row.createdAt, range.from, range.to),
  );

  return (
    <PageShell title="Refunds">
      <ManagerSubnav manager="finance" activeHref="/manager/finance/refunds" />
      <ManagerSectionHeader
        title="Refunds"
        description={
          error ??
          `Money that went back to a customer. ${
            note ??
            "A refund is either a request raised on an order or a payout already made; the status below is read from those records rather than from a separate workflow, and nothing on this screen moves money."
          }`
        }
      />
      <Suspense fallback={null}>
        <RangeSelector
          basePath="/manager/finance/refunds"
          initialFrom={range.from}
          initialTo={range.to}
          initialPreset={range.preset}
        />
      </Suspense>
      <RefundsPanel rows={rows} currencyCode={currency} rangeLabel={range.label} />
    </PageShell>
  );
}
