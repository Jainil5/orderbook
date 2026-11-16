import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { VisitsManager } from "@/components/manager/visits-manager";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { formatDate } from "@/lib/format";
import { followUpTasks, taskCategory, TASK_CATEGORY_LABELS } from "@/lib/manager/task-meta";
import { isTaskOverdue } from "@/lib/manager/tasks";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityActivitiesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("visits")) redirect("/manager/productivity");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Follow-ups & activities">
        <ManagerSubnav manager="productivity" activeHref="/manager/productivity/activities" />
        <EmptyState
          title="Field visits are not connected to live workspaces yet"
          description="Visits, check-ins and reports need the operations tables in the live database. Demo workspaces have full visit tracking today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  // Visits and tasks are CSV rows now, so the operations read already carries
  // every in-app edit; only the customer list needs its own query.
  const [ops, staff, customers] = await Promise.all([
    loadDemoOperations(code),
    listDemoStaff(code),
    listDemoCustomers(undefined, code),
  ]);
  const now = new Date();
  const followUps = followUpTasks(ops.tasks, now);
  const staffName = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Unassigned";

  return (
    <PageShell title="Follow-ups & activities">
      <ManagerSubnav manager="productivity" activeHref="/manager/productivity/activities" />
      <ManagerSectionHeader
        title="Follow-ups & activities"
        description="Field visits with check-in and reports, follow-up reminders, meeting notes and pending responses."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Follow-ups due</h2>
          <Link
            href="/manager/productivity/tasks"
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
          >
            Open tasks
          </Link>
        </div>
        {followUps.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
            Nothing is waiting on a follow-up.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {followUps.map((task) => {
              const overdue = isTaskOverdue(task, now);
              return (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    {task.title}
                    <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">
                      {TASK_CATEGORY_LABELS[taskCategory(task)]}
                    </span>
                    {overdue ? (
                      <span className="ml-2 rounded bg-[#fbeaec] px-1.5 py-0.5 text-xs text-[#be123c]">
                        Overdue
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--ob-text-muted)]">
                    {staffName(task.assigneeStaffId)}
                    {task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <VisitsManager
        visits={ops.visits}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
