"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  checkInVisitAction,
  checkOutVisitAction,
  deleteVisitAction,
  saveVisitAction,
} from "@/services/manager-ops-actions";
import { useMounted } from "@/lib/use-mounted";
import type { FieldVisit } from "@/types/operations";

type Option = { id: string; name: string };

export function VisitsManager({
  visits,
  customers,
  staff,
  canEdit,
}: {
  visits: FieldVisit[];
  customers: Option[];
  staff: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Card actions report errors next to the list / inside the checkout form,
  // not in the remote plan/edit form card.
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldVisit | null>(null);
  // Selects have no empty option: default to the first available choice.
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [purpose, setPurpose] = useState("");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [report, setReport] = useState("");

  async function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    setErr: (value: string | null) => void = setError,
  ) {
    if (pending) return false;
    setPending(true);
    setErr(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setErr(result.message ?? "Could not save.");
      return false;
    } catch {
      setErr("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(visit: FieldVisit | null) {
    setEditing(visit);
    setCustomerId(visit?.customerId ?? customers[0]?.id ?? "");
    setStaffId(visit?.staffId ?? staff[0]?.id ?? "");
    setPurpose(visit?.purpose ?? "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string) => list.find((p) => p.id === id)?.name ?? "Unknown";
  // Locale check-in/out strings depend on the browser timezone; render them
  // only after mount so SSR output stays stable.
  const mounted = useMounted();
  const groups = [
    { status: "planned" as const, label: "Planned" },
    { status: "checked_in" as const, label: "Checked in" },
    { status: "completed" as const, label: "Completed" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit visit" : "Plan a visit"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveVisitAction(editing?.id ?? null, { customerId, staffId, purpose }));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Staff member</span>
            <select className="ob-input mt-1 w-full" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!canEdit || pending}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Purpose</span>
            <input className="ob-input mt-1 w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)} required maxLength={200} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={!canEdit || pending || customers.length === 0 || staff.length === 0}>
              {pending ? "Saving…" : editing ? "Save changes" : "Plan visit"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {actionError ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{actionError}</p> : null}
        {groups.map((group) => {
          const items = visits.filter((v) => v.status === group.status);
          return (
            <section key={group.status}>
              <h2 className="mb-2 text-sm font-semibold">{group.label} ({items.length})</h2>
              {items.length === 0 ? (
                <p className="text-sm text-[var(--ob-text-muted)]">No visits.</p>
              ) : items.map((v) => (
                <Card key={v.id} className="mb-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{v.purpose}</p>
                      <p className="text-sm text-[var(--ob-text-muted)]">
                        {nameOf(customers, v.customerId)} · {nameOf(staff, v.staffId)}
                        {mounted && v.checkInAt ? ` · in ${new Date(v.checkInAt).toLocaleString()}` : ""}
                        {mounted && v.checkOutAt ? ` · out ${new Date(v.checkOutAt).toLocaleString()}` : ""}
                      </p>
                      {v.report ? <p className="mt-1 text-sm">{v.report}</p> : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {v.status === "planned" ? (
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={pending} onClick={() => run(() => checkInVisitAction(v.id), setActionError)}>Check in</button>
                        ) : null}
                        {v.status === "checked_in" ? (
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={pending} onClick={() => { setCheckoutId(v.id); setReport(""); setCheckoutError(null); }}>Check out</button>
                        ) : null}
                        {v.status === "planned" ? (
                          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => startEdit(v)}>Edit</button>
                        ) : null}
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm disabled:opacity-50" disabled={pending} onClick={() => run(() => deleteVisitAction(v.id), setActionError)}>Delete</button>
                      </div>
                    ) : null}
                  </div>
                  {checkoutId === v.id ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await run(() => checkOutVisitAction(v.id, report), setCheckoutError);
                        if (ok) {
                          setCheckoutId(null);
                          setCheckoutError(null);
                        }
                      }}
                    >
                      <label className="block text-sm">
                        <span className="text-[var(--ob-text-muted)]">Visit report (required)</span>
                        <textarea className="ob-input mt-1 w-full" rows={3} value={report} onChange={(e) => setReport(e.target.value)} required maxLength={500} disabled={pending} />
                      </label>
                      {checkoutError ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{checkoutError}</p> : null}
                      <div className="flex gap-2">
                        <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50" disabled={pending}>Complete visit</button>
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm disabled:opacity-50" disabled={pending} onClick={() => { setCheckoutId(null); setCheckoutError(null); }}>Cancel</button>
                      </div>
                    </form>
                  ) : null}
                </Card>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
