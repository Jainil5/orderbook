import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { LeadsManager } from "@/components/manager/leads-manager";
import { toDemoBrandCode } from "@/lib/demo/data";
import { listDemoLeads } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";

export default async function LeadsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("leads")) redirect("/manager");
  // The pipeline only exists for brands that quote against a site.
  if (ws.profile.capture !== "project") redirect("/manager");

  const code = toDemoBrandCode(ws.brand.code);
  const leads = await listDemoLeads(code);
  const staff = await listDemoStaff(code);
  return (
    <PageShell title="Leads Pipeline">
      <ManagerSubnav activeHref="/manager/leads" />
      <LeadsManager
        leads={leads}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        currencyCode={ws.settings.currency_code}
        canEdit

        canAdd={canAddWorkspaceRecords(ws)}
      />
    </PageShell>
  );
}
