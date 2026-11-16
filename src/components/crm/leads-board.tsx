"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import {
  EMPTY_CONVERSION_INPUT,
  conversionCheck,
  leadHistoryCount,
  type ConversionInput,
} from "@/lib/crm/conversion";
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
  attachLeadToCustomerAction,
  convertLeadAction,
  deleteCrmLeadAction,
  moveCrmLeadStageAction,
  saveCrmLeadAction,
} from "@/services/crm-actions";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/types/operations";

type Option = { id: string; name: string };

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

/**
 * The pipeline as a board. Dragging a card is the fast path; the ←/→ buttons do
 * exactly the same thing for a keyboard, a phone, or anyone who does not drag.
 */
export function LeadsBoard({
  leads,
  staff,
  interactions,
  currencyCode,
}: {
  leads: Lead[];
  staff: Option[];
  interactions: { lead_id: string | null }[];
  currencyCode: string;
}) {
  const router = useRouter();
  const convertRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadInput>(EMPTY);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [conversion, setConversion] = useState<ConversionInput>(EMPTY_CONVERSION_INPUT);
  const [clash, setClash] = useState<{ id: string; message: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  const patch = (fields: Partial<LeadInput>) => setForm((prev) => ({ ...prev, ...fields }));

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

  function startConvert(lead: Lead) {
    const check = conversionCheck(lead);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setConverting(lead);
    setConversion(EMPTY_CONVERSION_INPUT);
    setClash(null);
    setError(null);
    convertRef.current?.showModal();
  }

  async function moveTo(lead: Lead, stage: LeadStage) {
    if (lead.stage === stage) return;
    await run(() => moveCrmLeadStageAction(lead.id, stage));
  }

  async function submitConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!converting || pending) return;
    setPending(true);
    setError(null);
    setClash(null);
    try {
      const result = await convertLeadAction(converting.id, conversion);
      if (result.ok) {
        convertRef.current?.close();
        setConverting(null);
        router.refresh();
        return;
      }
      // A clash is not an error to repeat: the enquiry belongs to somebody
      // already on file, so offer the attach instead.
      if ("customerId" in result && result.customerId) {
        setClash({ id: result.customerId, message: result.message });
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not convert. Try again.");
    } finally {
      setPending(false);
    }
  }

  const mounted = useMounted();
  const now = new Date();
  const summary = pipelineSummary(leads);
  const nameOf = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : null;

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
          hint={summary.closedCount ? `${summary.closedCount} closed` : "Nothing closed yet"}
        />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold">{editing ? "Edit enquiry" : "New enquiry"}</h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveCrmLeadAction(editing?.id ?? null, form));
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
              disabled={pending}
            />
          </Field>
          <Field label="Requirement">
            <input
              className="ob-input mt-1 w-full"
              value={form.requirement}
              onChange={(e) => patch({ requirement: e.target.value })}
              required
              maxLength={500}
              disabled={pending}
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
              disabled={pending}
            />
          </Field>
          <Field label="Stage">
            <select
              className="ob-input mt-1 w-full"
              value={form.stage}
              onChange={(e) => patch({ stage: e.target.value })}
              disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
            />
          </Field>
          <Field label="Phone">
            <input
              className="ob-input mt-1 w-full"
              value={form.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              maxLength={20}
              disabled={pending}
            />
          </Field>
          <Field label="Email">
            <input
              className="ob-input mt-1 w-full"
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              maxLength={160}
              disabled={pending}
            />
          </Field>
          <Field label="Source">
            <input
              className="ob-input mt-1 w-full"
              value={form.source}
              onChange={(e) => patch({ source: e.target.value })}
              maxLength={60}
              placeholder="Referral, Instagram, walk-in…"
              disabled={pending}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Site address">
              <input
                className="ob-input mt-1 w-full"
                value={form.site_address}
                onChange={(e) => patch({ site_address: e.target.value })}
                maxLength={240}
                disabled={pending}
              />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add enquiry"}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {LEAD_STAGES.map((stage) => {
          const inStage = leads.filter((l) => l.stage === stage);
          const { back, forward } = leadStageNeighbours(stage);
          return (
            <section
              key={stage}
              aria-label={LEAD_STAGE_LABELS[stage]}
              className={cn(
                "rounded-[var(--ob-radius-lg)] border p-2 transition-colors",
                over === stage
                  ? "border-[var(--ob-leaf)] bg-[var(--ob-tint-wash)]"
                  : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)]/40",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((prev) => (prev === stage ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                setOver(null);
                setDragging(null);
                const lead = leads.find((l) => l.id === id);
                if (lead) void moveTo(lead, stage);
              }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h3 className="ob-label-quiet">{LEAD_STAGE_LABELS[stage]}</h3>
                <span className="text-xs text-[var(--ob-text-muted)]">
                  <span className="ob-num">{inStage.length}</span> ·{" "}
                  {formatMoney(
                    inStage.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
                    currencyCode,
                  )}
                </span>
              </div>
              <div className="space-y-2">
                {inStage.length === 0 ? (
                  <p className="px-1 py-3 text-xs text-[var(--ob-text-muted)]">
                    {back || forward ? "Drop an enquiry here." : "Nothing in this column."}
                  </p>
                ) : null}
                {inStage.map((lead) => {
                  const overdue = mounted && isLeadOverdue(lead, now);
                  const converted = Boolean(lead.converted_customer_id);
                  const history = leadHistoryCount(lead.id, interactions);
                  const neighbours = leadStageNeighbours(lead.stage);
                  return (
                    <article
                      key={lead.id}
                      draggable={!converted && !pending}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(lead.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className={cn(
                        "ob-card ob-animate-in block p-3 text-sm",
                        converted ? "opacity-70" : "cursor-grab active:cursor-grabbing",
                        dragging === lead.id && "opacity-50",
                        overdue && "border border-[var(--ob-danger)]!",
                      )}
                    >
                      <p className="font-medium">
                        {lead.contact_name}
                        {overdue ? (
                          <Badge tone="danger" className="ml-2">
                            Overdue
                          </Badge>
                        ) : null}
                        {converted ? (
                          <Badge tone="success" className="ml-2">
                            Customer
                          </Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[var(--ob-text-muted)]">{lead.requirement}</p>
                      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                        {formatMoney(lead.estimated_value, currencyCode)}
                        {nameOf(lead.owner_staff_id) ? ` · ${nameOf(lead.owner_staff_id)}` : ""}
                        {lead.source ? ` · ${lead.source}` : ""}
                        {lead.quotation_number ? ` · ${lead.quotation_number}` : ""}
                      </p>
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {[
                          lead.phone,
                          lead.email,
                          mounted && lead.next_action_at
                            ? `follow up ${formatDate(lead.next_action_at)}`
                            : null,
                          history ? `${history} logged` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {converted ? (
                          <Link
                            href={`/customers/${lead.converted_customer_id}`}
                            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-xs font-semibold"
                          >
                            Open the record
                          </Link>
                        ) : (
                          <>
                            {neighbours.back ? (
                              <button
                                type="button"
                                className="ob-touch-target ob-btn-ghost rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                                disabled={pending}
                                onClick={() => void moveTo(lead, neighbours.back as LeadStage)}
                              >
                                ←
                              </button>
                            ) : null}
                            {neighbours.forward ? (
                              <button
                                type="button"
                                className="ob-press ob-btn-primary ob-touch-target rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                                disabled={pending}
                                onClick={() => void moveTo(lead, neighbours.forward as LeadStage)}
                              >
                                →
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ob-touch-target ob-btn-ghost rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                              disabled={pending}
                              onClick={() => startEdit(lead)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ob-press ob-btn-primary ob-touch-target rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                              disabled={pending}
                              onClick={() => startConvert(lead)}
                            >
                              Convert
                            </button>
                            <button
                              type="button"
                              className="ob-touch-target ob-btn-ghost rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                              disabled={pending}
                              onClick={() => run(() => deleteCrmLeadAction(lead.id))}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <dialog
        ref={convertRef}
        className="m-auto max-h-[90vh] w-[min(100%,32rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => {
          setError(null);
          setClash(null);
        }}
      >
        <form className="space-y-3 p-5" onSubmit={submitConvert}>
          <div>
            <h2 className="font-semibold">Convert {converting?.contact_name}</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              The enquiry stays on the board as a won card and keeps its logged history —
              converting adds a customer, it never deletes the trail.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price list">
              <select
                className="ob-input mt-1 w-full"
                value={conversion.price_tier}
                onChange={(e) => setConversion((p) => ({ ...p, price_tier: e.target.value }))}
                disabled={pending}
              >
                <option value="">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </Field>
            <Field label="Tags">
              <input
                className="ob-input mt-1 w-full"
                value={conversion.tags}
                onChange={(e) => setConversion((p) => ({ ...p, tags: e.target.value }))}
                placeholder="trade, repeat"
                disabled={pending}
              />
            </Field>
          </div>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Notes</span>
            <textarea
              className="ob-input mt-1 min-h-16 w-full"
              value={conversion.notes}
              onChange={(e) => setConversion((p) => ({ ...p, notes: e.target.value }))}
              maxLength={500}
              disabled={pending}
            />
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={conversion.marketing_consent === "yes"}
              onChange={(e) =>
                setConversion((p) => ({ ...p, marketing_consent: e.target.checked ? "yes" : "no" }))
              }
              disabled={pending}
            />
            <span>
              They agreed to receive offers
              <span className="mt-0.5 block text-xs text-[var(--ob-text-muted)]">
                Left off on purpose: an enquiry is not a marketing permission.
              </span>
            </span>
          </label>

          {clash ? (
            <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-warning)] p-3 text-sm">
              <p>{clash.message}</p>
              <button
                type="button"
                className="ob-press ob-btn-primary ob-touch-target mt-2 rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={pending}
                onClick={async () => {
                  if (!converting) return;
                  const ok = await run(() => attachLeadToCustomerAction(converting.id, clash.id));
                  if (ok) {
                    convertRef.current?.close();
                    setConverting(null);
                  }
                }}
              >
                Attach this enquiry to that customer
              </button>
            </div>
          ) : null}

          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Converting…" : "Create the customer"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => convertRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ob-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
