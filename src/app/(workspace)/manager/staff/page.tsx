import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerOverview } from "@/components/manager/manager-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { loadBusinessData } from "@/lib/business/registry";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { isOnShift } from "@/lib/manager/schedules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff Manager">
        <ManagerOverview manager="staff" />
        <div className="mt-4">
          <EmptyState
            title="Staff records are not connected to live workspaces yet"
            description="Employee profiles, shifts, attendance and leave need the staff tables in the live database. Demo workspaces show the full experience today."
          />
        </div>
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [staff, ops, business] = await Promise.all([
    listDemoStaff(code),
    loadDemoOperations(code),
    loadBusinessData(code),
  ]);
  const summary = staffAvailabilitySummary(staff);
  const now = new Date();
  const openTasks = ops.tasks.filter((t) => t.status !== "done");

  return (
    <PageShell title="Staff Manager">
      <ManagerOverview
        manager="staff"
        stats={[
          {
            label: "Active staff",
            value: String(summary.active),
            hint: `${summary.available} available · ${summary.busy} busy · ${summary.off} off`,
            href: "/manager/staff/directory",
          },
          {
            label: "On shift now",
            value: String(ops.shifts.filter((shift) => isOnShift(shift, now)).length),
            hint: "Today's rota",
            href: "/manager/staff/schedules",
          },
          {
            label: "Assigned tasks",
            value: String(openTasks.length),
            hint: "Open across the team",
            href: "/manager/staff/performance",
          },
          {
            label: "Leave requests",
            value: String(business.leave.filter((l) => l.status === "pending").length),
            hint: "Awaiting a decision",
            href: "/manager/staff/attendance",
          },
        ]}
      />
    </PageShell>
  );
}
