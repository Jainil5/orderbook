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
import { recentDays, summarizeAttendance, todayDay } from "@/lib/manager/workforce";
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
  const assignedOpen = ops.tasks.filter(
    (task) => task.assigneeStaffId !== null && task.status !== "done",
  );
  const week = recentDays(todayDay(), 7);
  const attendance = summarizeAttendance(business.attendance, {
    from: week[0],
    to: week[week.length - 1],
  });
  const pendingLeave = business.leave.filter((l) => l.status === "pending").length;

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
            value: String(assignedOpen.length),
            hint: "Open work given to employees",
            href: "/manager/staff/performance",
          },
          {
            label: "Leave requests",
            value: String(pendingLeave),
            hint: "Awaiting a decision",
            href: "/manager/staff/attendance",
          },
          {
            label: "Attendance (7 days)",
            value: attendance.days ? `${attendance.rate.toFixed(0)}%` : "No records",
            hint: `${attendance.expected} days expected · ${attendance.absent} absent`,
            href: "/manager/staff/attendance",
          },
        ]}
      />
    </PageShell>
  );
}
