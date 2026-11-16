import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { StaffManager } from "@/components/manager/staff-manager";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { STAFF_ROLE_LABELS } from "@/lib/manager/staff";
import { formatDate } from "@/lib/format";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffDirectoryPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager/staff");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff Directory">
        <ManagerSubnav manager="staff" activeHref="/manager/staff/directory" />
        <EmptyState
          title="Staff is not connected to live workspaces yet"
          description="Employee records need the staff tables in the live database. Demo workspaces have full staff management today."
        />
      </PageShell>
    );
  }

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));

  return (
    <PageShell title="Staff Directory">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/directory" />
      <StaffManager staff={staff} canEdit />

      <Card className="mt-4 overflow-x-auto p-0">
        <div className="p-4 pb-0">
          <h2 className="font-semibold">Roster details</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Read-only details carried by the employee record itself.
          </p>
        </div>
        <table className="mt-3 w-full min-w-[520px] border-collapse text-sm">
          <caption className="sr-only">Team, employment status and roster date per employee</caption>
          <thead>
            <tr className="bg-[var(--ob-surface-muted)]">
              <th className="p-2 text-left font-medium">Employee</th>
              <th className="p-2 text-left font-medium">Team</th>
              <th className="p-2 text-left font-medium">Employment status</th>
              <th className="p-2 text-left font-medium">On the roster since</th>
              <th className="p-2 text-left font-medium">Contact</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t border-[var(--ob-border)]">
                <td className="p-2 font-medium">{member.name}</td>
                <td className="p-2 text-[var(--ob-text-muted)]">
                  {STAFF_ROLE_LABELS[member.role]} team
                </td>
                <td className="p-2 text-[var(--ob-text-muted)]">
                  {member.status === "active" ? "Active employee" : "Inactive (off roster)"}
                </td>
                <td className="p-2 text-[var(--ob-text-muted)]">{formatDate(member.created_at)}</td>
                <td className="p-2 text-[var(--ob-text-muted)]">
                  {member.phone ?? member.email ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-4 text-xs text-[var(--ob-text-muted)]">
          There is no separate department, joining date or contract type field on the staff
          record yet, so these columns read the role, status and record date.
        </p>
      </Card>
    </PageShell>
  );
}
