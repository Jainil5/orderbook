import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { NotesManager } from "@/components/manager/productivity/notes-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { notesCollection } from "@/lib/business/registry";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityNotesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("notes")) redirect("/manager/productivity");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Notes">
        <ManagerSubnav manager="productivity" activeHref="/manager/productivity/notes" />
        <EmptyState
          title="Notes are not connected to live workspaces yet"
          description="Business notes need the notes table in the live database. Demo workspaces have full note management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  // Notes, appointments and tasks all come from their CSV tables now; the
  // collection read already includes everything saved inside the app.
  const [notes, ops, staff, customers] = await Promise.all([
    notesCollection.load(code),
    loadDemoOperations(code),
    listDemoStaff(code),
    listDemoCustomers(undefined, code),
  ]);

  return (
    <PageShell title="Notes">
      <ManagerSubnav manager="productivity" activeHref="/manager/productivity/notes" />
      <ManagerSectionHeader
        title="Notes"
        description="Personal and shared business notes, searchable and linked to customers, staff, appointments or tasks."
      />
      <NotesManager
        notes={notes}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        appointments={ops.appointments.map((a) => ({ id: a.id, name: a.title }))}
        tasks={ops.tasks.map((t) => ({ id: t.id, name: t.title }))}
        canEdit
      />
    </PageShell>
  );
}
