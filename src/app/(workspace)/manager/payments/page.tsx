import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { PaymentsTable } from "@/components/payments/payments-table";
import { listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ManagerPaymentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("payments")) redirect("/manager");

  const payments = await listDemoPayments(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Payments">
      <ManagerSubnav activeHref="/manager/payments" />
      <PaymentsTable
        payments={payments}
        currencyCode={ws.settings.currency_code}
      />
    </PageShell>
  );
}
