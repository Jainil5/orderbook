import { PageShell } from "@/components/workspace/page-shell";
import { PaymentsTable } from "@/components/payments/payments-table";
import { listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function PaymentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

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