"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import {
  LEAD_STAGE_LABELS,
  OPEN_LEAD_STAGES,
  isLeadOverdue,
  leadStageNeighbours,
  pipelineSummary,
  type LeadInput,
} from "@/lib/manager/leads";
import { toLocalInputValue } from "@/lib/manager/time";
import { useMounted } from "@/lib/use-mounted";
import {
  deleteLeadAction,
  saveLeadAction,
  setLeadStageAction,
} from "@/services/manager-ops-actions";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/types/operations";

type Option = { id: string; name: string };
type Filter = "all" | LeadStage | "overdue";

const STAGE_TONE: Record<LeadStage, "neutral" | "warning" | "success" | "danger"> = {
  new: "neutral",
  site_visit: "neutral",
  quote_sent: "warning",
  negotiating: "warning",
  won: "success",
  lost: "danger",
};

const EMPTY: LeadInput = {
  contact_name: "",
  phone: "",
  email: "",
  source: "",
  requirement: "",
  site_address: "",
  stage: "new",
  estimated_value: "",
  owner_staff_id: "",
  next_action_at: "",
};

function toInput(lead: Lead): LeadInput {
  return {
    contact_name: lead.contact_name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "",
    requirement: lead.requirement,
    site_address: lead.site_address ?? "",
    stage: lead.stage,
    estimated_value: lead.estimated_value ? String(lead.estimated_value) : "",
    owner_staff_id: lead.owner_staff_id ?? "",
    next_action_at: lead.next_action_at ? toLocalInputValue(lead.next_action_at) : "",
  };
}

export function LeadsManager({
  leads,
  staff,
  currencyCode,
  canEdit,
  canAdd,
}: {
  leads: Lead[];
  staff: Option[];
  currencyCode: string;
  canEdit: boolean;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadInput>(EMPTY);

  const patch = (fields: Partial<LeadInput>) =>
    setForm((prev) => ({ ...prev, ...fields }));

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

  function startEdit(lead: Lead | null) {
    setEditing(lead);
    setForm(lead ? toInput(lead) : EMPTY);
    setError(null);
  }

  // Overdue flags and locale date strings depend on the browser clock; evaluate
  // them only after mount so SSR output stays stable.
  const mounted = useMounted();
  const now = new Date();
  const summary = pipelineSummary(leads);
  const nameOf = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : null;

  const matchesFilter = (lead: Lead) => {
    if (filter === "all") return true;
    if (filter === "overdue") return mounted && isLeadOverdue(lead, now);
    return lead.stage === filter;
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: leads.length },
    ...LEAD_STAGES.map((stage) => ({
      key: stage as Filter,
      label: LEAD_STAGE_LABELS[stage],
      count: summary.byStage[stage].count,
    })),
    {
      key: "overdue",
      label: "Overdue",
      count: mounted ? leads.filter((l) => isLeadOverdue(l, now)).length : 0,
    },
  ];

  const stagesWithLeads = LEAD_STAGES.filter(
    (stage) => leads.some((l) => l.stage === stage && matchesFilter(l)),
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open leads"
          value={String(summary.openCount)}
          hint={`${OPEN_LEAD_STAGES.length} live stages`}
        />
        <StatCard
          label="Open pipeline"
          value={formatMoney(summary.openValue, currencyCode)}
          hint="Estimated value still to win"
        />
        <StatCard
          label="Won"
          value={formatMoney(summary.wonValue, currencyCode)}
          tone="up"
          hint="Closed won"
        />
        <StatCard
          label="Win rate"
          value={summary.winRatePercent === null ? "—" : `${summary.winRatePercent}%`}
          hint={
            summary.closedCount
              ? `${summary.closedCount} closed`
              : "Nothing closed yet"
          }
        />
      </div>

      {canAdd || editing ? (
        <Card className="p-4">
          <h2 className="font-semibold">{editing ? "Edit lead" : "New lead"}</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => saveLeadAction(editing?.id ?? null, form));
              if (ok) startEdit(null);
            }}
          >
            <Field label="Contact name">
              <input
                className="ob-input mt-1 w-full"
                value={form.contact_name}
                onChange={(e) => patch({ contact_name: e.target.value })}
                required
                maxLength={120}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Requirement">
              <input
                className="ob-input mt-1 w-full"
                value={form.requirement}
                onChange={(e) => patch({ requirement: e.target.value })}
                required
                maxLength={500}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Estimated value">
              <input
                className="ob-input mt-1 w-full"
                type="number"
                min={0}
                step={1}
                value={form.estimated_value}
                onChange={(e) => patch({ estimated_value: e.target.value })}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Stage">
              <select
                className="ob-input mt-1 w-full"
                value={form.stage}
                onChange={(e) => patch({ stage: e.target.value })}
                disabled={!canEdit || pending}
              >
                {LEAD_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {LEAD_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <select
                className="ob-input mt-1 w-full"
                value={form.owner_staff_id}
                onChange={(e) => patch({ owner_staff_id: e.target.value })}
                disabled={!canEdit || pending}
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Next action">
              <input
                className="ob-input mt-1 w-full"
                type="datetime-local"
                value={form.next_action_at}
                onChange={(e) => patch({ next_action_at: e.target.value })}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Phone">
              <input
                className="ob-input mt-1 w-full"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                maxLength={20}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Email">
              <input
                className="ob-input mt-1 w-full"
                type="email"
                value={form.email}
                onChange={(e) => patch({ email: e.target.value })}
                maxLength={160}
                disabled={!canEdit || pending}
              />
            </Field>
            <Field label="Source">
              <input
                className="ob-input mt-1 w-full"
                value={form.source}
                onChange={(e) => patch({ source: e.target.value })}
                maxLength={60}
                placeholder="Referral, Instagram, walk-in…"
                disabled={!canEdit || pending}
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Site address">
                <input
                  className="ob-input mt-1 w-full"
                  value={form.site_address}
                  onChange={(e) => patch({ site_address: e.target.value })}
                  maxLength={240}
                  disabled={!canEdit || pending}
                />
              </Field>
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={!canEdit || pending}
              >
                {pending ? "Saving…" : editing ? "Save changes" : "Add lead"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() => startEdit(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter leads">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            className={cn(
              "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
              filter === f.key
                ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
            )}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {stagesWithLeads.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
          No leads match this filter.
        </Card>
      ) : (
        stagesWithLeads.map((stage) => (
          <section key={stage} aria-label={LEAD_STAGE_LABELS[stage]}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="ob-label-quiet">{LEAD_STAGE_LABELS[stage]}</h2>
              <span className="text-xs text-[var(--ob-text-muted)]">
                {summary.byStage[stage].count} ·{" "}
                {formatMoney(summary.byStage[stage].value, currencyCode)}
              </span>
            </div>
            <div className="space-y-2">
              {leads
                .filter((l) => l.stage === stage && matchesFilter(l))
                .map((lead) => {
                  const overdue = mounted && isLeadOverdue(lead, now);
                  const { back, forward } = leadStageNeighbours(lead.stage);
                  const owner = nameOf(lead.owner_staff_id);
                  return (
                    <Card
                      key={lead.id}
                      className={`p-4${overdue ? " border border-[var(--ob-danger)]!" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {lead.contact_name}
                            <Badge
                              tone={STAGE_TONE[lead.stage]}
                              className="ml-2"
                            >
                              {LEAD_STAGE_LABELS[lead.stage]}
                            </Badge>
                            {overdue ? (
                              <Badge tone="danger" className="ml-2">
                                Overdue
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-sm text-[var(--ob-text-muted)]">
                            {lead.requirement}
                          </p>
                          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                            {formatMoney(lead.estimated_value, currencyCode)}
                            {owner ? ` · ${owner}` : " · Unassigned"}
                            {lead.source ? ` · ${lead.source}` : ""}
                            {lead.quotation_number
                              ? ` · ${lead.quotation_number}`
                              : ""}
                          </p>
                          <p className="text-xs text-[var(--ob-text-muted)]">
                            {[
                              lead.phone,
                              lead.email,
                              lead.site_address,
                              mounted && lead.next_action_at
                                ? `follow up ${new Date(lead.next_action_at).toLocaleString()}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            {back ? (
                              <button
                                type="button"
                                className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                                disabled={pending}
                                onClick={() =>
                                  run(() => setLeadStageAction(lead.id, back))
                                }
                              >
                                ← {LEAD_STAGE_LABELS[back]}
                              </button>
                            ) : null}
                            {forward ? (
                              <button
                                type="button"
                                className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                                disabled={pending}
                                onClick={() =>
                                  run(() => setLeadStageAction(lead.id, forward))
                                }
                              >
                                {LEAD_STAGE_LABELS[forward]} →
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                              disabled={pending}
                              onClick={() => startEdit(lead)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                              disabled={pending}
                              onClick={() => run(() => deleteLeadAction(lead.id))}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ob-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
