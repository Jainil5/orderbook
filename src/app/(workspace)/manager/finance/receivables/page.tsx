import { redirect } from "next/navigation";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { ReceivablesPanel } from "@/components/manager/finance/receivables-panel";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { PageShell } from "@/components/workspace/page-shell";
import {
  OVERDUE_AFTER_DAYS,
  customerPaymentHistory,
  receivableRows,
} from "@/lib/business/cash";
import { listDemoOrders, listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { exportReceivablesCsvAction } from "@/services/finance-actions";
import { listOrders, listPayments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Order, Payment } from "@/types/database";

export default async function FinanceReceivablesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("receivables")) redirect("/manager/finance");

  // Receivables are an all-time book, not a period report: a balance stays open
  // until it is paid, so the list is deliberately not range-filtered.
  let orders: Order[] = [];
  let payments: Payment[] = [];
  let error: string | null = null;
  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    [orders, payments] = await Promise.all([
      listDemoOrders(undefined, code),
      listDemoPayments(code),
    ]);
  } else {
    const [ordersRes, paymentsRes] = await Promise.all([
      listOrders({ page: 1, pageSize: 100 }),
      listPayments(),
    ]);
    orders = ordersRes.data;
    payments = paymentsRes.data;
    error = ordersRes.error ?? paymentsRes.error ?? null;
  }

  return (
    <PageShell
      title="Receivables"
      headerActions={
        <CsvExportButton label="Export CSV" onExport={exportReceivablesCsvAction} />
      }
    >
      <ManagerSubnav manager="finance" activeHref="/manager/finance/receivables" />
      <ManagerSectionHeader
        title="Receivables"
        description={
          error ??
          "Posted invoices with a balance still open, aged from the day they were raised. Invoices carry no due date in this app, so a fixed payment term is applied and stated on the list. This is an outstanding-money worklist, not an accounts receivable ledger — nothing here accrues, writes off or charges interest."
        }
      />
      <ReceivablesPanel
        rows={receivableRows(orders, payments)}
        history={customerPaymentHistory(orders, payments)}
        currencyCode={ws.settings.currency_code}
        overdueAfterDays={OVERDUE_AFTER_DAYS}
      />
    </PageShell>
  );
}
