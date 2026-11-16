import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { CalendarAgenda } from "@/components/manager/productivity/calendar-agenda";
import { EmptyState } from "@/components/ui/empty-state";
import { externalEventsCollection } from "@/lib/business/registry";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { buildCalendarEntries, dayKeyOf } from "@/lib/manager/calendar";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityCalendarPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("calendar")) redirect("/manager/productivity");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Calendar & agenda">
        <ManagerSubnav manager="productivity" activeHref="/manager/productivity/calendar" />
        <EmptyState
          title="The agenda is not connected to live workspaces yet"
          description="Appointments, tasks, visits and shifts need the operations tables in the live database. Demo workspaces show the unified calendar today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [ops, externalEvents, staff] = await Promise.all([
    loadDemoOperations(code),
    externalEventsCollection.load(code),
    listDemoStaff(code),
  ]);
  const entries = buildCalendarEntries({
    appointments: ops.appointments,
    tasks: ops.tasks,
    visits: ops.visits,
    shifts: ops.shifts,
    externalEvents,
  });
  const staffNames = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  const today = dayKeyOf(new Date());

  return (
    <PageShell title="Calendar & agenda">
      <ManagerSubnav manager="productivity" activeHref="/manager/productivity/calendar" />
      <ManagerSectionHeader
        title="Calendar & agenda"
        description="One agenda for appointments, bookings, meetings, tasks and synced external events, with conflict detection."
      />
      <CalendarAgenda entries={entries} staffNames={staffNames} today={today} />
    </PageShell>
  );
}
