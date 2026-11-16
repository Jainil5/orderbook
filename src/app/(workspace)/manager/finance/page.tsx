import { redirect } from "next/navigation";
import { ManagerOverview } from "@/components/manager/manager-ui";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/workspace/page-shell";
import {
  businessDayOf,
  isoDay,
  paymentsInMonth,
  receivableRows,
  refundsTotal,
  totalExposure,
  refundRows,
} from "@/lib/business/cash";
import { monthKey, totalExpenses } from "@/lib/business/expenses";
import { loadBusinessData } from "@/lib/business/registry";
import {
  listDemoOrders,
  listDemoPayments,
  listDemoRefunds,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { listOrders, listPayments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Order, Payment, Refund } from "@/types/database";
import type { Expense } from "@/types/business";

export default async function FinanceManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const currency = ws.settings.currency_code;
  const money = (value: number) => formatMoney(value, currency);
  const now = new Date();
  const month = monthKey(isoDay(now));

  let orders: Order[] = [];
  let payments: Payment[] = [];
  let refunds: Refund[] = [];
  // Expenses and cash sessions have no live tables (docs/DATABASE_CONTRACT.md),
  // so on a live workspace those two figures stay blank rather than showing zero.
  let expenses: Expense[] | null = null;
  let notice: string | null = null;

  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const [demoOrders, demoPayments, business, demoRefunds] = await Promise.all([
      listDemoOrders(undefined, code),
      listDemoPayments(code),
      loadBusinessData(code),
      // Refunds live in their own table now, so this is every refund the app
      // recorded plus any row an owner added to refunds.csv by hand.
      listDemoRefunds(code),
    ]);
    orders = demoOrders;
    payments = demoPayments;
    expenses = business.expenses;
    refunds = demoRefunds;
  } else {
    const [ordersRes, paymentsRes] = await Promise.all([
      listOrders({ page: 1, pageSize: 500 }),
      listPayments(),
    ]);
    orders = ordersRes.data;
    payments = paymentsRes.data;
    notice = ordersRes.error ?? paymentsRes.error ?? null;
  }

  const collectedThisMonth = paymentsInMonth(payments, now).reduce(
    (total, p) => total + p.amount,
    0,
  );
  const rows = receivableRows(orders, payments);
  const outstanding = totalExposure(rows);
  const overdue = rows
    .filter((row) => row.overdue)
    .reduce((total, row) => total + row.due, 0);
  const refundRowsForMonth = refundRows(refunds, payments, orders).filter(
    (row) => monthKey(businessDayOf(row.createdAt)) === month,
  );
  const refundsThisMonth = refundsTotal(refundRowsForMonth);
  const expensesThisMonth = expenses
    ? totalExpenses(expenses.filter((e) => monthKey(e.incurredOn) === month))
    : null;
  const netCash =
    expensesThisMonth === null
      ? null
      : Math.round((collectedThisMonth - expensesThisMonth - refundsThisMonth) * 100) / 100;

  return (
    <PageShell title="Finance Manager">
      <ManagerOverview
        manager="finance"
        stats={[
          {
            label: "Collected this month",
            value: money(collectedThisMonth),
            hint: "Payment records with a positive amount",
            href: "/manager/finance/payments",
          },
          {
            label: "Outstanding",
            value: money(outstanding),
            hint: `${rows.length} open invoice${rows.length === 1 ? "" : "s"}`,
            href: "/manager/finance/receivables",
          },
          {
            label: "Overdue",
            value: money(overdue),
            hint: "Older than the 15-day term",
            href: "/manager/finance/receivables",
          },
          {
            label: "Refunds this month",
            value: money(refundsThisMonth),
            hint: `${refundRowsForMonth.length} refund${refundRowsForMonth.length === 1 ? "" : "s"} recorded`,
            href: "/manager/finance/refunds",
          },
          {
            label: "Expenses this month",
            value: expensesThisMonth === null ? "Not connected" : money(expensesThisMonth),
            hint:
              expensesThisMonth === null
                ? "Expenses are demo-only today"
                : "Money out, recorded in this app",
            href: "/manager/finance/expenses",
          },
          {
            label: "Net cash position",
            value: netCash === null ? "Not connected" : money(netCash),
            hint: "Collected less expenses less refunds, this month",
            href: "/manager/finance/cash",
          },
        ]}
      >
        <Card className="mb-4 p-4">
          <p className="text-sm text-[var(--ob-text-muted)]">
            {notice ? (
              <span className="mb-2 block text-[var(--ob-danger)]">{notice}</span>
            ) : null}
            These screens are financial operations, not accounting: every figure
            is read back from records the app already holds — payments on orders,
            expense entries and cash sessions. There is no ledger, journal,
            depreciation or tax filing here, and nothing on these pages posts an
            accounting entry.
          </p>
        </Card>
      </ManagerOverview>
    </PageShell>
  );
}
