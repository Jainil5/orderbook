"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { STAFF_ROLE_LABELS } from "@/lib/manager/staff";
import {
  ATTENDANCE_STATUS_LABELS,
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  attendanceOn,
  leaveDayCount,
  pendingLeaves,
  shiftDay,
  summarizeAttendance,
  todayDay,
  unavailableStaffOn,
  weekDaysOf,
  type AttendanceSummary,
} from "@/lib/manager/workforce";
import {
  approveLeaveAction,
  deleteAttendanceAction,
  rejectLeaveAction,
  requestLeaveAction,
  saveAttendanceAction,
  type LeaveInput,
} from "@/services/staff-manager-actions";
import {
  ATTENDANCE_STATUSES,
  LEAVE_KINDS,
  type AttendanceRecord,
  type AttendanceStatus,
  type LeaveRequest,
} from "@/types/business";
import type { StaffMember } from "@/types/manager";

type View = "day" | "week";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-[#e8f4ec] text-[#15803d]",
  late: "bg-[#fdf1e3] text-[#b45309]",
  half_day: "bg-[var(--ob-surface-muted)] text-[var(--ob-text-secondary)]",
  absent: "bg-[#fbeaec] text-[#be123c]",
  leave: "bg-violet-50 text-[var(--ob-demo)]",
};

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });

const rangeLabel = (days: string[]) =>
  `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`;

export function AttendanceManager({
  staff,
  attendance,
  leave,
  canEdit,
}: {
  /** Active employees only. */
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  leave: LeaveRequest[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(() => todayDay());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<LeaveInput>({
    staffId: staff[0]?.id ?? "",
    startsOn: day,
    endsOn: day,
    kind: "casual",
    reason: "",
  });

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.message ?? "Could not save.");
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const days = view === "day" ? [day] : weekDaysOf(day);
  const step = view === "day" ? 1 : 7;
  const from = days[0];
  const to = days[days.length - 1];
  const week = weekDaysOf(day);
  const range = summarizeAttendance(attendance, { from, to });
  const away = unavailableStaffOn(day, staff, leave, attendance);
  const pendingRequests = pendingLeaves(leave);
  const decided = leave
    .filter((l) => l.status !== "pending")
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  function weekSummary(member: StaffMember): AttendanceSummary {
    return summarizeAttendance(attendance, {
      staffId: member.id,
      from: week[0],
      to: week[6],
    });
  }

  function statusSelect(member: StaffMember, date: string, compact: boolean) {
    const record = attendanceOn(attendance, member.id, date);
    return (
      <select
        aria-label={`Attendance status for ${member.name} on ${date}`}
        className={`ob-input ${compact ? "w-full text-xs" : "min-w-[9rem]"} ${
          record ? STATUS_STYLES[record.status] : ""
        }`}
        value={record?.status ?? ""}
        disabled={!canEdit || busy}
        onChange={(e) =>
          run(() =>
            saveAttendanceAction(record?.id ?? null, {
              staffId: member.id,
              date,
              status: e.target.value,
            }),
          )
        }
      >
        <option value="">Not marked</option>
        {ATTENDANCE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {ATTENDANCE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Attendance view"
          value={view}
          onChange={setView}
          options={[
            { id: "day", label: "Day" },
            { id: "week", label: "Week" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={`Previous ${view}`}
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
            onClick={() => setDay(shiftDay(day, -step))}
          >
            ←
          </button>
          <label className="text-sm">
            <span className="sr-only">Attendance date</span>
            <input
              type="date"
              className="ob-input"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label={`Next ${view}`}
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
            onClick={() => setDay(shiftDay(day, step))}
          >
            →
          </button>
          <button
            type="button"
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
            onClick={() => setDay(todayDay())}
          >
            Today
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--ob-text-muted)]">
        {rangeLabel(days)} · {range.days} records marked ·{" "}
        <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES.present}`}>
          {range.rate.toFixed(0)}% attendance
        </span>
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            Attendance for {rangeLabel(days)}, one row per employee
          </caption>
          <thead>
            <tr className="bg-[var(--ob-surface-muted)]">
              <th className="p-2 text-left font-medium">Employee</th>
              {view === "day" ? (
                <>
                  <th className="p-2 text-left font-medium">Status</th>
                  <th className="p-2 text-left font-medium">Clocking</th>
                  <th className="p-2 text-left font-medium">This week</th>
                  <th className="p-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </>
              ) : (
                <>
                  {days.map((d) => (
                    <th key={d} className="p-2 text-left font-medium">
                      {dayLabel(d)}
                    </th>
                  ))}
                  <th className="p-2 text-left font-medium">Week rate</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-3 text-[var(--ob-text-muted)]">
                  No active staff. Add employees in the directory first.
                </td>
              </tr>
            ) : (
              staff.map((member) => {
                const record = attendanceOn(attendance, member.id, day);
                const summary = weekSummary(member);
                return (
                  <tr key={member.id} className="border-t border-[var(--ob-border)]">
                    <td className="p-2 align-top font-medium">
                      {member.name}
                      <span className="block text-xs font-normal text-[var(--ob-text-muted)]">
                        {STAFF_ROLE_LABELS[member.role]}
                      </span>
                    </td>
                    {view === "day" ? (
                      <>
                        <td className="p-2 align-top">{statusSelect(member, day, false)}</td>
                        <td className="p-2 align-top text-[var(--ob-text-muted)]">
                          {record?.checkIn
                            ? `${record.checkIn}–${record.checkOut ?? ""}`
                            : "—"}
                          {record?.note ? (
                            <span className="block text-xs">{record.note}</span>
                          ) : null}
                        </td>
                        <td className="p-2 align-top text-[var(--ob-text-muted)]">
                          {summary.present + summary.late} of {summary.days} days present
                          {summary.halfDay ? ` · ${summary.halfDay} half day` : ""}
                          {summary.absent ? ` · ${summary.absent} absent` : ""}
                          {summary.leave ? ` · ${summary.leave} on leave` : ""}
                        </td>
                        <td className="p-2 text-right align-top">
                          {canEdit && record ? (
                            <button
                              type="button"
                              className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-xs"
                              disabled={busy}
                              onClick={() => run(() => deleteAttendanceAction(record.id))}
                            >
                              Clear
                            </button>
                          ) : null}
                        </td>
                      </>
                    ) : (
                      <>
                        {days.map((d) => (
                          <td key={d} className="p-1.5 align-top">
                            {statusSelect(member, d, true)}
                          </td>
                        ))}
                        <td className="p-2 align-top text-[var(--ob-text-muted)]">
                          {summary.rate.toFixed(0)}%
                          <span className="block text-xs">
                            {summary.attended} days worked
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {away.length > 0 ? (
        <Card className="p-4">
          <h2 className="font-semibold">Not available on {dayLabel(day)}</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Approved leave or a recorded absence — avoid booking these employees for
            shifts, visits or appointments.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {away.map((row) => (
              <li
                key={row.member.id}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  row.reason === "leave" ? STATUS_STYLES.leave : STATUS_STYLES.absent
                }`}
              >
                {row.member.name} · {row.detail}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit p-4 lg:col-span-1">
          <h2 className="font-semibold">Log a leave request</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => requestLeaveAction(form));
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Employee</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.staffId}
                onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                disabled={!canEdit || busy || staff.length === 0}
              >
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">First day</span>
                <input
                  type="date"
                  className="ob-input mt-1 w-full"
                  value={form.startsOn}
                  onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                  required
                  disabled={!canEdit || busy}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Last day</span>
                <input
                  type="date"
                  className="ob-input mt-1 w-full"
                  value={form.endsOn}
                  onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                  required
                  disabled={!canEdit || busy}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Leave type</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                disabled={!canEdit || busy}
              >
                {LEAVE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {LEAVE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Reason (optional)</span>
              <input
                className="ob-input mt-1 w-full"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                maxLength={200}
                disabled={!canEdit || busy}
              />
            </label>
            <button
              type="submit"
              className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={!canEdit || busy || staff.length === 0}
            >
              {busy ? "Saving…" : "Request leave"}
            </button>
          </form>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          <Card className="p-4">
            <h2 className="font-semibold">
              Pending requests
              <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">
                {pendingRequests.length}
              </span>
            </h2>
            <div className="mt-2 space-y-3">
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-[var(--ob-text-muted)]">
                  Nothing waiting for a decision.
                </p>
              ) : (
                pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <p className="min-w-0 text-sm">
                      <span className="font-medium">
                        {staff.find((s) => s.id === request.staffId)?.name ?? "Unknown"}
                      </span>{" "}
                      · {LEAVE_KIND_LABELS[request.kind]} · {request.startsOn} →{" "}
                      {request.endsOn} ({leaveDayCount(request.startsOn, request.endsOn)} days)
                      <span className="block text-xs text-[var(--ob-text-muted)]">
                        {request.reason || "No reason given"}
                      </span>
                    </p>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy}
                          onClick={() => run(() => approveLeaveAction(request.id))}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                          disabled={busy}
                          onClick={() => run(() => rejectLeaveAction(request.id))}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Decided requests</h2>
            <div className="mt-2 space-y-2">
              {decided.length === 0 ? (
                <p className="text-sm text-[var(--ob-text-muted)]">No decisions yet.</p>
              ) : (
                decided.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <p className="min-w-0">
                      <span className="font-medium">
                        {staff.find((s) => s.id === request.staffId)?.name ?? "Unknown"}
                      </span>{" "}
                      · {LEAVE_KIND_LABELS[request.kind]} · {request.startsOn} →{" "}
                      {request.endsOn} ({leaveDayCount(request.startsOn, request.endsOn)} days)
                    </p>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        request.status === "approved"
                          ? STATUS_STYLES.present
                          : STATUS_STYLES.absent
                      }`}
                    >
                      {LEAVE_STATUS_LABELS[request.status]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
