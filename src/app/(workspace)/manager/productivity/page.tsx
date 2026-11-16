import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerOverview } from "@/components/manager/manager-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { loadBusinessData } from "@/lib/business/registry";
import { computeRollups } from "@/lib/business/overview";
import { listDemoOrders, listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { buildCalendarEntries, dayKey, dayKeyOf } from "@/lib/manager/calendar";
import { followUpTasks } from "@/lib/manager/task-meta";
import { isTaskOverdue } from "@/lib/manager/tasks";
import { loadIntegrationsView } from "@/lib/integrations/service";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Productivity Manager">
        <ManagerOverview manager="productivity" />
        <div className="mt-4">
          <EmptyState
            title="Productivity is not connected to live workspaces yet"
            description="Tasks, notes, the unified agenda, appointments and field visits need the operations tables in the live database. Demo workspaces show the full experience today."
          />
        </div>
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [ops, business, orders, products] = await Promise.all([
    loadDemoOperations(code),
    loadBusinessData(code),
    listDemoOrders(undefined, code),
    listDemoProductsMerged({}, code),
  ]);

  const now = new Date();
  const rollups = computeRollups(
    {
      orders,
      products,
      tasks: ops.tasks,
      appointments: ops.appointments,
      shifts: ops.shifts,
      expenses: business.expenses,
      purchaseOrders: business.purchaseOrders,
      leave: business.leave,
    },
    now,
  );
  const today = dayKeyOf(now);
  const agendaToday = buildCalendarEntries({
    appointments: ops.appointments,
    tasks: ops.tasks,
    visits: ops.visits,
    shifts: ops.shifts,
    externalEvents: business.externalEvents,
  }).filter((entry) => dayKey(entry.startsAt) === today).length;
  const followUps = followUpTasks(ops.tasks, now);
  const notes = business.notes;
  // The integrations row only appears when the section is switched on for this
  // industry/brand; reading the view is server-side and never touches a token.
  const showIntegrations = !ws.hiddenManagerModules.includes("integrations");
  const integrations = showIntegrations
    ? await loadIntegrationsView({ code, role: ws.role, live: false })
    : null;
  const connectedChannels =
    integrations?.connections.filter((entry) => entry.status === "connected").length ?? 0;

  return (
    <PageShell title="Productivity Manager">
      <ManagerOverview
        manager="productivity"
        stats={[
          {
            label: "Open tasks",
            value: String(rollups.tasksOpen),
            hint: `${rollups.tasksDueToday} due today · ${rollups.tasksOverdue} overdue`,
            href: "/manager/productivity/tasks",
          },
          {
            label: "On the agenda today",
            value: String(agendaToday),
            hint: `${rollups.appointmentsToday} appointments booked`,
            href: "/manager/productivity/calendar",
          },
          {
            label: "Follow-ups due",
            value: String(followUps.length),
            hint: `${followUps.filter((t) => isTaskOverdue(t, now)).length} overdue`,
            href: "/manager/productivity/activities",
          },
          {
            label: "Notes",
            value: String(notes.length),
            hint: `${notes.filter((n) => n.pinned).length} pinned · ${notes.filter((n) => n.scope === "shared").length} shared`,
            href: "/manager/productivity/notes",
          },
          ...(integrations
            ? [
                {
                  label: "Connected channels",
                  value: `${connectedChannels}`,
                  hint:
                    connectedChannels === 0
                      ? "Set up Google Calendar, Gmail or WhatsApp"
                      : `${connectedChannels} syncing · ${integrations.pendingActions.length} waiting to go out`,
                  href: "/manager/productivity/integrations",
                },
              ]
            : []),
        ]}
      />
    </PageShell>
  );
}
