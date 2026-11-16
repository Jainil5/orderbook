import { redirect } from "next/navigation";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { CashRegister } from "@/components/manager/finance/cash-register";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/workspace/page-shell";
import { isoDay } from "@/lib/business/cash";
import { loadBusinessData } from "@/lib/business/registry";
import { listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function FinanceCashPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("cash")) redirect("/manager/finance");

  const header = (
    <ManagerSectionHeader
      title="Cash register"
      description="One session per trading day: the opening float, every cash movement the records show, and the counted balance at close. Inflows are cash payments on bills and manual cash-ins; outflows are cash expenses and manual cash-outs — a movement already carried by a bill or an expense is never counted twice. Variance is the count minus what the drawer should hold; it is a discrepancy to investigate, not an adjusting entry."
    />
  );

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Cash register">
        <ManagerSubnav manager="finance" activeHref="/manager/finance/cash" />
        {header}
        <EmptyState
          title="Cash sessions are not connected to live workspaces yet"
          description="Sessions and drawer entries need the cash tables in the live database (see docs/DATABASE_CONTRACT.md). Cash payments recorded on orders still appear under Payments. Demo workspaces can open, count and close a drawer today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [business, payments, staff] = await Promise.all([
    loadBusinessData(code),
    listDemoPayments(code),
    listDemoStaff(code),
  ]);

  return (
    <PageShell title="Cash register">
      <ManagerSubnav manager="finance" activeHref="/manager/finance/cash" />
      {header}
      <CashRegister
        records={{
          payments,
          expenses: business.expenses,
          movements: business.cashMovements,
        }}
        sessions={business.cashSessions}
        staff={staff.map((member) => ({ id: member.id, name: member.name }))}
        currencyCode={ws.settings.currency_code}
        today={isoDay(new Date())}
      />
    </PageShell>
  );
}
