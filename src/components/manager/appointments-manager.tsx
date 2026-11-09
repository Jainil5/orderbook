"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { APPOINTMENT_STATUS_LABELS, groupAppointments } from "@/lib/manager/appointments";
import { useMounted } from "@/lib/use-mounted";
import {
  deleteAppointmentAction,
  saveAppointmentAction,
  setAppointmentStatusAction,
} from "@/services/manager-ops-actions";
import type { Appointment } from "@/types/operations";

type Option = { id: string; name: string };

// datetime-local inputs need LOCAL time; stored timestamps are ISO/UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentsManager({
  appointments,
  customers,
  staff,
  services,
  canEdit,
}: {
  appointments: Appointment[];
  customers: Option[];
  staff: Option[];
  services: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [notes, setNotes] = useState("");

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

  function startEdit(appointment: Appointment | null) {
    setEditing(appointment);
    setTitle(appointment?.title ?? "");
    setCustomerId(appointment?.customerId ?? "");
    setStaffIds(appointment?.staffIds ?? []);
    setStartsAt(appointment ? toLocalInput(appointment.startsAt) : "");
    setEndsAt(appointment ? toLocalInput(appointment.endsAt) : "");
    setLocation(appointment?.location ?? "");
    setServiceId(appointment?.serviceId ?? "");
    setNotes(appointment?.notes ?? "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((p) => p.id === id)?.name ?? "Unknown" : null;
  // Grouping and locale time strings depend on the browser clock/timezone;
  // evaluate them only after mount so SSR output stays stable.
  const mounted = useMounted();
  const groups = mounted ? groupAppointments(appointments, new Date()) : null;
  const sections = groups
    ? [
        { label: "Today", items: groups.today },
        { label: "Upcoming", items: groups.upcoming },
        { label: "Past", items: groups.past },
      ]
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit appointment" : "New appointment"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveAppointmentAction(editing?.id ?? null, {
                title,
                customerId: customerId || undefined,
                staffIds,
                startsAt,
                endsAt,
                location,
                serviceId: serviceId || undefined,
                notes,
              }),
            );
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Title</span>
            <input className="ob-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <fieldset disabled={!canEdit || pending}>
            <legend className="text-sm text-[var(--ob-text-muted)]">Staff</legend>
            <div className="mt-1 space-y-1">
              {staff.map((s) => (
                <label key={s.id} className="ob-touch-target flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={staffIds.includes(s.id)} onChange={(e) => setStaffIds(e.target.checked ? [...staffIds, s.id] : staffIds.filter((id) => id !== s.id))} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Starts</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Ends</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required disabled={!canEdit || pending} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Location (optional)</span>
            <input className="ob-input mt-1 w-full" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Service (optional)</span>
            <select className="ob-input mt-1 w-full" value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Notes (optional)</span>
            <input className="ob-input mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Schedule"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        {sections === null ? (
          <p className="text-sm text-[var(--ob-text-muted)]">Loading appointments…</p>
        ) : sections.map((section) => (
          <section key={section.label}>
            <h2 className="mb-2 text-sm font-semibold">{section.label} ({section.items.length})</h2>
            {section.items.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">No appointments.</p>
            ) : section.items.map((a) => (
              <Card key={a.id} className="mb-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {a.title}
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{APPOINTMENT_STATUS_LABELS[a.status]}</span>
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {new Date(a.startsAt).toLocaleString()} – {new Date(a.endsAt).toLocaleTimeString()}
                      {nameOf(customers, a.customerId) ? ` · ${nameOf(customers, a.customerId)}` : ""}
                      {a.location ? ` · ${a.location}` : ""}
                    </p>
                    {a.staffIds.length > 0 ? (
                      <p className="text-sm text-[var(--ob-text-muted)]">{a.staffIds.map((id) => nameOf(staff, id)).join(", ")}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {a.status === "scheduled" ? (
                        <>
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setAppointmentStatusAction(a.id, "completed"))}>Complete</button>
                          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => setAppointmentStatusAction(a.id, "cancelled"))}>Cancel</button>
                        </>
                      ) : null}
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => startEdit(a)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteAppointmentAction(a.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
