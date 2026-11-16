import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { TasksManager } from "@/components/manager/tasks-manager";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import {
  openTasksByCategory,
  recurringTasks,
  reminderDueTasks,
  TASK_CATEGORY_LABELS,
  TASK_RECURRENCE_LABELS,
  taskRecurrence,
} from "@/lib/manager/task-meta";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityTasksPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("tasks")) redirect("/manager/productivity");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Tasks & to-dos">
        <ManagerSubnav manager="productivity" activeHref="/manager/productivity/tasks" />
        <EmptyState
          title="Tasks are not connected to live workspaces yet"
          description="Tasks need the operations tables in the live database. Demo workspaces have full task management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  // `loadDemoOperations` is the CSV: tasks created or edited in the app are
  // rows in tasks.csv, so there is no bucket to layer on top any more.
  const [ops, staff, customers] = await Promise.all([
    loadDemoOperations(code),
    listDemoStaff(code),
    listDemoCustomers(undefined, code),
  ]);

  const categories = openTasksByCategory(ops.tasks);
  const repeating = recurringTasks(ops.tasks);
  const reminders = reminderDueTasks(ops.tasks, new Date());
  const staffName = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Unassigned";

  return (
    <PageShell title="Tasks & to-dos">
      <ManagerSubnav manager="productivity" activeHref="/manager/productivity/tasks" />
      <ManagerSectionHeader
        title="Tasks & to-dos"
        description="Assign work with priorities, due dates, categories, recurrence and reminders."
      />

      <Card className="mb-4 p-4">
        <h2 className="font-semibold">Categories, recurrence and reminders</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Open by category
            </h3>
            {categories.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ob-text-muted)]">No open tasks.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {categories.map((group) => (
                  <li key={group.category} className="text-sm">
                    {TASK_CATEGORY_LABELS[group.category]}
                    <span className="text-[var(--ob-text-muted)]"> ({group.tasks.length})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Repeating
            </h3>
            {repeating.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ob-text-muted)]">No repeating tasks.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {repeating.map((task) => (
                  <li key={task.id} className="text-sm">
                    {task.title}
                    <span className="text-[var(--ob-text-muted)]">
                      {" · "}
                      {TASK_RECURRENCE_LABELS[taskRecurrence(task)]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              Reminders due
            </h3>
            {reminders.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ob-text-muted)]">Nothing to nudge yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {reminders.map((task) => (
                  <li key={task.id} className="text-sm">
                    {task.title}
                    <span className="text-[var(--ob-text-muted)]">
                      {" · "}
                      {staffName(task.assigneeStaffId)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
          Categories, recurrence and reminders are read from the task title,
          description, priority and due date — they are not stored on the task
          record yet.
        </p>
      </Card>

      <TasksManager
        tasks={ops.tasks}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        canEdit
      />
    </PageShell>
  );
}
