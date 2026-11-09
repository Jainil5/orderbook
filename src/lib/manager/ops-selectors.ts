import type { Appointment, FieldVisit, ServiceJob, Shift, Task } from "@/types/operations";
import { appointmentsForDay } from "./appointments";
import { isOnShift } from "./schedules";
import { isTaskOverdue } from "./tasks";

export type OpsTimelineRow = {
  kind: "appointment" | "visit" | "job" | "task";
  id: string;
  title: string;
  when: string | null;
  status: string;
  href: string;
};

export function customerOperationsTimeline(
  customerId: string,
  data: { appointments: Appointment[]; visits: FieldVisit[]; jobs: ServiceJob[]; tasks: Task[] },
  serviceNames: Record<string, string>,
): OpsTimelineRow[] {
  const rows: OpsTimelineRow[] = [];
  for (const a of data.appointments) {
    if (a.customerId === customerId) {
      rows.push({ kind: "appointment", id: a.id, title: a.title, when: a.startsAt, status: a.status, href: "/manager/appointments" });
    }
  }
  for (const v of data.visits) {
    if (v.customerId === customerId) {
      rows.push({ kind: "visit", id: v.id, title: v.purpose, when: v.checkInAt, status: v.status, href: "/manager/visits" });
    }
  }
  for (const t of data.tasks) {
    if (t.customerId === customerId && t.status !== "done") {
      rows.push({ kind: "task", id: t.id, title: t.title, when: t.dueAt, status: t.status, href: "/manager/tasks" });
    }
  }
  for (const j of data.jobs) {
    if (j.customerId === customerId) {
      rows.push({ kind: "job", id: j.id, title: serviceNames[j.serviceId] ?? "Service job", when: j.scheduledAt, status: j.status, href: "/manager/services" });
    }
  }
  return rows.sort((a, b) => {
    if (a.when === null && b.when === null) return 0;
    if (a.when === null) return 1;
    if (b.when === null) return -1;
    return b.when.localeCompare(a.when);
  });
}

export function overviewRollups(
  data: { appointments: Appointment[]; tasks: Task[]; shifts: Shift[]; visits: FieldVisit[]; jobs: ServiceJob[] },
  now: Date,
): { todayAppointments: number; overdueTasks: number; onShiftNow: number; activeVisits: number; openJobs: number } {
  const today = now.toISOString().slice(0, 10);
  return {
    todayAppointments: appointmentsForDay(data.appointments, today).filter((a) => a.status === "scheduled").length,
    overdueTasks: data.tasks.filter((t) => isTaskOverdue(t, now)).length,
    onShiftNow: data.shifts.filter((s) => isOnShift(s, now)).length,
    activeVisits: data.visits.filter((v) => v.status === "checked_in").length,
    openJobs: data.jobs.filter((j) => j.status !== "completed").length,
  };
}
