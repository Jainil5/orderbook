"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { STAFF_AVAILABILITY_LABELS, STAFF_ROLE_LABELS } from "@/lib/manager/staff";
import { isTaskOverdue } from "@/lib/manager/tasks";
import {
  recentDays,
  shiftHoursForRange,
  todayDay,
} from "@/lib/manager/workforce";
import type { StaffMember } from "@/types/manager";
import type { FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";

type Period = "7" | "14" | "30";

type ActivityRow = {
  key: string;
  when: string;
  kind: "Visit" | "Service job" | "Shift";
  title: string;
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "7", label: "Last 7 days" },
  { id: "14", label: "Last 14 days" },
  { id: "30", label: "Last 30 days" },
];

const inDayRange = (iso: string, from: string, to: string) => {
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
};

function activityRows(
  staffId: string,
  data: { visits: FieldVisit[]; jobs: ServiceJob[]; shifts: Shift[]; services: Service[] },
  from: string,
  to: string,
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const visit of data.visits) {
    if (visit.staffId !== staffId) continue;
    const when = visit.checkInAt ?? visit.checkOutAt;
    if (!when || !inDayRange(when, from, to)) continue;
    rows.push({
      key: visit.id,
      when,
      kind: "Visit",
      title: visit.status === "checked_in" ? `${visit.purpose} (checked in)` : visit.purpose,
    });
  }
  for (const job of data.jobs) {
    if (!job.staffIds.includes(staffId) || !job.scheduledAt) continue;
    if (!inDayRange(job.scheduledAt, from, to)) continue;
    const service = data.services.find((s) => s.id === job.serviceId);
    rows.push({
      key: job.id,
      when: job.scheduledAt,
      kind: "Service job",
      title: `${service?.name ?? "Service job"} · ${job.status.replace("_", " ")}`,
    });
  }
  for (const shift of data.shifts) {
    if (shift.staffId !== staffId || shift.date < from || shift.date > to) continue;
    rows.push({
      key: shift.id,
      when: `${shift.date}T${shift.start}:00`,
      kind: "Shift",
      title: `${shift.start}–${shift.end}${shift.note ? ` · ${shift.note}` : ""}`,
    });
  }
  return rows.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 5);
}

export function StaffPerformance({
  staff,
  tasks,
  shifts,
  visits,
  jobs,
  services,
}: {
  staff: StaffMember[];
  tasks: Task[];
  shifts: Shift[];
  visits: FieldVisit[];
  jobs: ServiceJob[];
  services: Service[];
}) {
  const [period, setPeriod] = useState<Period>("14");
  const days = Number(period);
  const range = recentDays(todayDay(), days);
  const from = range[0];
  const to = range[range.length - 1];
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Performance period" value={period} onChange={setPeriod} options={PERIODS} />
        <p className="text-sm text-[var(--ob-text-muted)]">{from} → {to}</p>
      </div>

      {staff.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
          No active staff to report on.
        </Card>
      ) : (
        <div className="ob-stagger grid gap-3 lg:grid-cols-2">
          {staff.map((member) => {
            const assigned = tasks.filter((t) => t.assigneeStaffId === member.id);
            const done = assigned.filter((t) => t.status === "done");
            const overdue = assigned.filter((t) => isTaskOverdue(t, now));
            const completionRate = assigned.length
              ? Math.round((done.length / assigned.length) * 100)
              : 0;
            const hours = shiftHoursForRange(shifts, member.id, from, to);
            const periodVisits = visits.filter(
              (v) => v.staffId === member.id && v.checkInAt && inDayRange(v.checkInAt, from, to),
            );
            const periodJobs = jobs.filter(
              (j) =>
                j.staffIds.includes(member.id) &&
                j.scheduledAt !== null &&
                inDayRange(j.scheduledAt, from, to),
            );
            const rows = activityRows(member.id, { visits, jobs, shifts, services }, from, to);

            return (
              <Card key={member.id} className="p-4">
                <div>
                  <h2 className="font-semibold">{member.name}</h2>
                  <p className="text-sm text-[var(--ob-text-muted)]">
                    {STAFF_ROLE_LABELS[member.role]} ·{" "}
                    {STAFF_AVAILABILITY_LABELS[member.availability]}
                  </p>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">Tasks</dt>
                    <dd className="mt-0.5 font-medium">
                      {done.length} / {assigned.length} done
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">Completion</dt>
                    <dd className="mt-0.5 font-medium">{completionRate}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">Overdue</dt>
                    <dd className={overdue.length ? "mt-0.5 font-medium text-[var(--ob-danger)]" : "mt-0.5 font-medium"}>
                      {overdue.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">Shift hours</dt>
                    <dd className="mt-0.5 font-medium">{hours}h</dd>
                  </div>
                </dl>

                <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
                  {periodVisits.length} visit{periodVisits.length === 1 ? "" : "s"} ·{" "}
                  {periodJobs.length} service job{periodJobs.length === 1 ? "" : "s"} in the period
                </p>

                <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                  Last activity
                </h3>
                {rows.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                    No visits, jobs or shifts in this period.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {rows.map((row) => (
                      <li key={`${row.kind}-${row.key}`} className="flex flex-wrap gap-x-2 text-sm">
                        <span className="rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-secondary)]">
                          {row.kind}
                        </span>
                        <span className="min-w-0">{row.title}</span>
                        <span className="text-xs text-[var(--ob-text-muted)]">
                          {new Date(row.when).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-sm text-[var(--ob-text-muted)]">
        Read-only view. Task counts come from the task list, hours from the rota, activity
        from visits and service jobs. Attendance is recorded on its own screen.
      </p>
    </div>
  );
}
