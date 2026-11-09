import { PageShell } from "@/components/workspace/page-shell";
import { PaymentsTable } from "@/components/payments/payments-table";
import { listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { listPayments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";

export default async function PaymentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const payments = await listDemoPayments(toDemoBrandCode(ws.brand.code));
    return (
      <PageShell title="Payments">
        <PaymentsTable
          payments={payments}
          currencyCode={ws.settings.currency_code}
        />
      </PageShell>
    );
  }

  const { data, error } = await listPayments();

  return (
    <PageShell title="Payments">
      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Record payments from an order detail page."
        />
      ) : (
        <PaymentsTable
          payments={data}
          currencyCode={ws.settings.currency_code}
          showOrderLink
        />
      )}
    </PageShell>
  );
}
