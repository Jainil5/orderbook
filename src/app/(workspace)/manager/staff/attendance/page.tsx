import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { AttendanceManager } from "@/components/manager/staff/attendance-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { attendanceCollection, leaveCollection } from "@/lib/business/registry";
import { toDemoBrandCode } from "@/lib/demo/data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffAttendancePage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("attendance")) redirect("/manager/staff");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Attendance & Leave">
        <ManagerSubnav manager="staff" activeHref="/manager/staff/attendance" />
        <EmptyState
          title="Attendance and leave are not connected to live workspaces yet"
          description="Daily attendance and leave approvals need the workforce tables in the live database. Demo workspaces keep a full attendance history today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [staff, attendance, leave] = await Promise.all([
    listDemoStaff(code),
    attendanceCollection.load(code),
    leaveCollection.load(code),
  ]);

  return (
    <PageShell title="Attendance & Leave">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/attendance" />
      <AttendanceManager
        staff={staff.filter((member) => member.status === "active")}
        attendance={attendance}
        leave={leave}
        canEdit
      />
    </PageShell>
  );
}
