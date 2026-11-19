import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { MeetingsWorkspace } from "@/components/manager/meetings-workspace";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("meetings")) redirect("/manager");

  const { tab } = await searchParams;
  const code = toDemoBrandCode(ws.brand.code);
  const bucket = await readDemoMutableBucket(code);
  const [ops, staff, customers] = await Promise.all([
    loadDemoOperations(code),
    listDemoStaff(code),
    mergeDemoCustomers(getDemoBrandPack(code).customers, bucket),
  ]);
  const options = (rows: { id: string; name: string }[]) =>
    rows.map((row) => ({ id: row.id, name: row.name }));
  return (
    <PageShell title="Meetings & Visits">
      <ManagerSubnav activeHref="/manager/meetings" />
      <MeetingsWorkspace
        initialTab={tab === "visits" ? "visits" : "meetings"}
        appointments={ops.appointments}
        visits={ops.visits}
        customers={options(customers)}
        staff={options(staff.filter((member) => member.status === "active"))}
        services={options(ops.services.filter((service) => service.isActive))}
        canEdit
        canAdd={canAddWorkspaceRecords()}
      />
    </PageShell>
  );
}
