"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  SERVICE_JOB_STATUSES,
  SERVICE_JOB_STATUS_LABELS,
  nextJobStatus,
} from "@/lib/manager/services";
import { toLocalInputValue } from "@/lib/manager/time";
import {
  advanceServiceJobAction,
  deleteServiceAction,
  deleteServiceJobAction,
  saveServiceAction,
  saveServiceJobAction,
  toggleServiceActiveAction,
} from "@/services/manager-ops-actions";
import { useMounted } from "@/lib/use-mounted";
import type { Service, ServiceJob } from "@/types/operations";

type Person = { id: string; name: string };

export function ServicesManager({
  services,
  jobs,
  customers,
  staff,
  canEdit,
}: {
  services: Service[];
  jobs: ServiceJob[];
  customers: Person[];
  staff: Person[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcDescription, setSvcDescription] = useState("");
  const [svcDuration, setSvcDuration] = useState("60");
  const [svcPrice, setSvcPrice] = useState("");

  const [editingJob, setEditingJob] = useState<ServiceJob | null>(null);
  // Initialize from the first option so an untouched select submits a real ID.
  const [jobService, setJobService] = useState(services[0]?.id ?? "");
  const [jobCustomer, setJobCustomer] = useState(customers[0]?.id ?? "");
  const [jobStaff, setJobStaff] = useState<string[]>([]);
  const [jobWhen, setJobWhen] = useState("");
  const [jobNotes, setJobNotes] = useState("");

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

  function startServiceEdit(service: Service | null) {
    setEditingService(service);
    setSvcName(service?.name ?? "");
    setSvcDescription(service?.description ?? "");
    setSvcDuration(String(service?.durationMinutes ?? 60));
    setSvcPrice(service ? String(service.price) : "");
    setError(null);
  }

  function startJobEdit(job: ServiceJob | null) {
    setEditingJob(job);
    setJobService(job?.serviceId ?? services[0]?.id ?? "");
    setJobCustomer(job?.customerId ?? customers[0]?.id ?? "");
    setJobStaff(job?.staffIds ?? []);
    setJobWhen(job?.scheduledAt ? toLocalInputValue(job.scheduledAt) : "");
    setJobNotes(job?.notes ?? "");
    setError(null);
  }

  const nameOf = (list: Person[], id: string) => list.find((p) => p.id === id)?.name ?? "Unknown";
  // Locale schedule strings depend on the browser timezone; render them only
  // after mount so SSR output stays stable.
  const mounted = useMounted();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <Card className="p-4">
          <h2 className="font-semibold">{editingService ? `Edit ${editingService.name}` : "New service"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveServiceAction(editingService?.id ?? null, {
                  name: svcName,
                  description: svcDescription,
                  durationMinutes: svcDuration,
                  price: svcPrice,
                }),
              );
              if (ok) startServiceEdit(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input className="ob-input mt-1 w-full" value={svcName} onChange={(e) => setSvcName(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Description (optional)</span>
              <input className="ob-input mt-1 w-full" value={svcDescription} onChange={(e) => setSvcDescription(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Duration (min)</span>
                <input className="ob-input mt-1 w-full" type="number" min={5} max={480} value={svcDuration} onChange={(e) => setSvcDuration(e.target.value)} required disabled={!canEdit || pending} />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Price</span>
                <input className="ob-input mt-1 w-full" type="number" min={0} step="0.01" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} required disabled={!canEdit || pending} />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={!canEdit || pending}>
                {pending ? "Saving…" : editingService ? "Save changes" : "Add service"}
              </button>
              {editingService ? (
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => startServiceEdit(null)}>Cancel</button>
              ) : null}
            </div>
          </form>
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold">{editingJob ? "Edit job" : "New service job"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveServiceJobAction(editingJob?.id ?? null, {
                  serviceId: jobService,
                  customerId: jobCustomer,
                  staffIds: jobStaff,
                  scheduledAt: jobWhen || undefined,
                  notes: jobNotes,
                }),
              );
              if (ok) startJobEdit(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Service</span>
              <select className="ob-input mt-1 w-full" value={jobService} onChange={(e) => setJobService(e.target.value)} disabled={!canEdit || pending}>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer</span>
              <select className="ob-input mt-1 w-full" value={jobCustomer} onChange={(e) => setJobCustomer(e.target.value)} disabled={!canEdit || pending}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <fieldset disabled={!canEdit || pending}>
              <legend className="text-sm text-[var(--ob-text-muted)]">Assign staff</legend>
              <div className="mt-1 space-y-1">
                {staff.map((s) => (
                  <label key={s.id} className="ob-touch-target flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={jobStaff.includes(s.id)}
                      onChange={(e) =>
                        setJobStaff(e.target.checked ? [...jobStaff, s.id] : jobStaff.filter((id) => id !== s.id))
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Scheduled at (optional)</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={jobWhen} onChange={(e) => setJobWhen(e.target.value)} disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Notes (optional)</span>
              <input className="ob-input mt-1 w-full" value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={!canEdit || pending || services.length === 0 || customers.length === 0}>
                {pending ? "Saving…" : editingJob ? "Save job" : "Request job"}
              </button>
              {editingJob ? (
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => startJobEdit(null)}>Cancel</button>
              ) : null}
            </div>
          </form>
        </Card>
        {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
      </div>
      <div className="space-y-4 lg:col-span-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Service catalogue</h2>
          <div className="space-y-2">
            {services.length === 0 ? (
              <Card className="p-4 text-sm text-[var(--ob-text-muted)]">No services yet. Add one to start taking jobs.</Card>
            ) : services.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.name}
                      {!s.isActive ? <Badge tone="neutral" className="ml-2">Inactive</Badge> : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">{s.durationMinutes} min · ₹{s.price}{s.description ? ` · ${s.description}` : ""}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => run(() => toggleServiceActiveAction(s.id, !s.isActive))}>{s.isActive ? "Deactivate" : "Activate"}</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => startServiceEdit(s)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => run(() => deleteServiceAction(s.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Service jobs</h2>
          <div className="space-y-3">
            {SERVICE_JOB_STATUSES.map((status) => {
              const group = jobs.filter((j) => j.status === status);
              return (
                <div key={status}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">{SERVICE_JOB_STATUS_LABELS[status]} ({group.length})</h3>
                  {group.length === 0 ? (
                    <p className="text-sm text-[var(--ob-text-muted)]">None.</p>
                  ) : group.map((j) => (
                    <Card key={j.id} className="mb-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{nameOf(services, j.serviceId)} — {nameOf(customers, j.customerId)}</p>
                          <p className="text-sm text-[var(--ob-text-muted)]">
                            {j.staffIds.length > 0 ? j.staffIds.map((id) => nameOf(staff, id)).join(", ") : "Unassigned"}
                            {mounted && j.scheduledAt ? ` · ${new Date(j.scheduledAt).toLocaleString()}` : ""}
                          </p>
                          {j.notes ? <p className="text-sm text-[var(--ob-text-muted)]">{j.notes}</p> : null}
                        </div>
                        {canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            {nextJobStatus(j.status) ? (
                              <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={pending} onClick={() => run(() => advanceServiceJobAction(j.id))}>
                                Mark {SERVICE_JOB_STATUS_LABELS[nextJobStatus(j.status)!].toLowerCase()}
                              </button>
                            ) : null}
                            <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => startJobEdit(j)}>Edit</button>
                            <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => run(() => deleteServiceJobAction(j.id))}>Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
