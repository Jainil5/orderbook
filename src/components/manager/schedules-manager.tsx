"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { isOnShift, weekDays } from "@/lib/manager/schedules";
import { localDayKey } from "@/lib/manager/time";
import { useMounted } from "@/lib/use-mounted";
import { deleteShiftAction, saveShiftAction } from "@/services/manager-ops-actions";
import type { Shift } from "@/types/operations";

type Option = { id: string; name: string };

export function SchedulesManager({
  shifts,
  staff,
  canEdit,
}: {
  shifts: Shift[];
  staff: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<Shift | null>(null);
  const [staffId, setStaffId] = useState(() => staff[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(shift: Shift | null) {
    setEditing(shift);
    setStaffId(shift?.staffId ?? staff[0]?.id ?? "");
    setDate(shift?.date ?? localDayKey(new Date()));
    setStart(shift?.start ?? "09:00");
    setEnd(shift?.end ?? "17:00");
    setNote(shift?.note ?? "");
    setError(null);
  }

  // Week labels and the on-shift badge depend on the browser clock/timezone;
  // render them only after mount so SSR output stays stable.
  const mounted = useMounted();
  const days = mounted ? weekDays(anchor) : [];
  const now = new Date();
  const weekHasToday = mounted && days.includes(localDayKey(now));
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit shift" : "Add shift"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveShiftAction(editing?.id ?? null, { staffId, date, start, end, note }));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Staff member</span>
            <select className="ob-input mt-1 w-full" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!canEdit || pending}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Date</span>
            <input className="ob-input mt-1 w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canEdit || pending} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Start</span>
              <input className="ob-input mt-1 w-full" type="time" value={start} onChange={(e) => setStart(e.target.value)} required disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">End</span>
              <input className="ob-input mt-1 w-full" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={!canEdit || pending} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
            <input className="ob-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={!canEdit || pending || staff.length === 0}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add shift"}
            </button>
            {editing ? (
              <>
                <button
                  type="button"
                  className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50"
                  disabled={!canEdit || pending}
                  onClick={async () => {
                    const ok = await run(() => deleteShiftAction(editing.id));
                    if (ok) startEdit(null);
                  }}
                >
                  Delete
                </button>
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => startEdit(null)}>Cancel</button>
              </>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="min-w-0 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 86400000))}>← Prev week</button>
          <p className="text-sm font-medium">{mounted ? `${dayLabel(days[0])} – ${dayLabel(days[6])}` : "…"}</p>
          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 86400000))}>Next week →</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[var(--ob-border)]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--ob-surface-muted)]">
                <th className="p-2 text-left font-medium">Staff</th>
                {days.map((day) => (
                  <th key={day} className="p-2 text-left font-medium">{dayLabel(day)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={8} className="p-3 text-[var(--ob-text-muted)]">No active staff. Add staff first.</td></tr>
              ) : staff.map((member) => {
                const onShift = weekHasToday && shifts.some((s) => s.staffId === member.id && isOnShift(s, now));
                return (
                  <tr key={member.id} className="border-t border-[var(--ob-border)]">
                    <td className="p-2 align-top font-medium">
                      {member.name}
                      {onShift ? <span className="ml-1 rounded bg-[#e8f4ec] px-1.5 py-0.5 text-xs text-[#15803d]">On shift</span> : null}
                    </td>
                    {days.map((day) => {
                      const cell = shifts.filter((s) => s.staffId === member.id && s.date === day);
                      return (
                        <td key={day} className="p-2 align-top">
                          {cell.length === 0 ? (
                            <span className="text-xs text-[var(--ob-text-muted)]">—</span>
                          ) : cell.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="ob-touch-target mb-1 block w-full rounded bg-[var(--ob-surface-muted)] px-2 py-1 text-left text-xs hover:bg-[var(--ob-border)] disabled:opacity-50"
                              disabled={pending}
                              onClick={() => startEdit(s)}
                              title={s.note || undefined}
                            >
                              {s.start}–{s.end}{s.note ? ` · ${s.note}` : ""}
                            </button>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">Tap a shift chip to edit or delete it. The grid scrolls sideways on small screens.</p>
      </div>
    </div>
  );
}
