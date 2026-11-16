import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { PaymentsTable } from "@/components/payments/payments-table";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RangeSelector } from "@/components/workspace/range-selector";
import { PageShell } from "@/components/workspace/page-shell";
import { orderInCalendarRange, resolveRange } from "@/lib/analytics/date-range";
import { paymentsByMethod, paymentsByStatus } from "@/lib/business/cash";
import { listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { listPayments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Payment } from "@/types/database";

export default async function FinancePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("payments")) redirect("/manager/finance");

  const range = resolveRange(await searchParams, "all");
  const currency = ws.settings.currency_code;

  // The list view this page replaced at `/payments`, kept as it was: demo
  // workspaces read the fixture payments, live workspaces read Supabase and get
  // a link to the order plus any read error. Both feed the same `PaymentsTable`.
  let all: Payment[] = [];
  let error: string | null = null;
  if (ws.mode === "demo") {
    all = await listDemoPayments(toDemoBrandCode(ws.brand.code));
  } else {
    const res = await listPayments();
    all = res.data;
    error = res.error ?? null;
  }
  const payments = all.filter((p) =>
    orderInCalendarRange(p.created_at, range.from, range.to),
  );
  const showOrderLink = ws.mode !== "demo";

  return (
    <PageShell title="Payments">
      <ManagerSubnav manager="finance" activeHref="/manager/finance/payments" />
      <PaymentSummary
        payments={payments}
        allCount={all.length}
        currency={currency}
        rangeLabel={range.label}
      />
      <Suspense fallback={null}>
        <RangeSelector
          basePath="/manager/finance/payments"
          initialFrom={range.from}
          initialTo={range.to}
          initialPreset={range.preset}
        />
      </Suspense>
      {error ? <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p> : null}
      {payments.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No payments yet" : "No payments in this range"}
          description={
            all.length === 0
              ? "Record payments from an order detail page."
              : `${all.length} payment${all.length === 1 ? "" : "s"} sit outside ${range.label}. Choose “All time” to see the whole list.`
          }
        />
      ) : (
        <PaymentsTable
          payments={payments}
          currencyCode={currency}
          showOrderLink={showOrderLink}
        />
      )}
    </PageShell>
  );
}

/** Method and status split for the selected window. */
function PaymentSummary({
  payments,
  allCount,
  currency,
  rangeLabel,
}: {
  payments: Payment[];
  allCount: number;
  currency: string;
  rangeLabel: string;
}) {
  const money = (value: number) => formatMoney(value, currency);
  const collected = payments
    .filter((p) => p.amount > 0)
    .reduce((total, p) => total + p.amount, 0);
  const paidOut = payments
    .filter((p) => p.amount < 0)
    .reduce((total, p) => total + Math.abs(p.amount), 0);
  const methods = paymentsByMethod(payments);
  const statuses = paymentsByStatus(payments);

  return (
    <div className="mb-4 space-y-4">
      <ManagerSectionHeader
        title="Payments"
        description="Every payment record on the bills this workspace has raised. Payments are written from an order screen — this list reads them, it does not edit them. Financial operations, not accounting: no posting and no reconciliation against a bank feed."
      />
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Collected
            </p>
            <p className="mt-1 text-lg font-semibold">{money(collected)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Paid out
            </p>
            <p className="mt-1 text-lg font-semibold">{money(paidOut)}</p>
            <p className="text-xs text-[var(--ob-text-muted)]">
              Negative records — refunds
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Records
            </p>
            <p className="mt-1 text-lg font-semibold">{payments.length}</p>
            <p className="text-xs text-[var(--ob-text-muted)]">
              of {allCount} all time · {rangeLabel}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Net movement
            </p>
            <p className="mt-1 text-lg font-semibold">{money(collected - paidOut)}</p>
          </div>
        </div>
        {methods.length > 0 && (
          <dl className="mt-4 grid gap-3 border-t border-[var(--ob-border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {methods.map((entry) => (
              <div key={entry.method}>
                <dt className="text-xs text-[var(--ob-text-muted)]">
                  {entry.method} · {entry.count}
                </dt>
                <dd className="text-sm font-medium">{money(entry.total)}</dd>
              </div>
            ))}
            {statuses.map((entry) => (
              <div key={entry.status}>
                <dt className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                  {entry.status} · {entry.count}
                </dt>
                <dd className="text-sm font-medium">{money(entry.total)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}
