"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPanel } from "@/components/crm/crm-ui";
import { saveInteractionAction } from "@/services/crm-interaction-actions";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
} from "@/types/crm";

/** `2026-11-16T09:30` — what a datetime-local input wants, in local time. */
function localDateTime(iso?: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

type FormState = {
  customer_id: string;
  lead_id: string;
  type: string;
  occurred_at: string;
  staff_id: string;
  subject: string;
  description: string;
  outcome: string;
  next_follow_up_at: string;
};

/**
 * Log one interaction.
 *
 * Recording what already happened — a call that was made, a meeting that took
 * place. The copy is deliberate: nothing here says a message was sent, and the
 * type list is the app's own `INTERACTION_TYPES`, not free text.
 */
export function InteractionForm({
  customers,
  leads,
  staff,
}: {
  customers: { id: string; name: string }[];
  leads: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });
  const [form, setForm] = useState<FormState>(() => ({
    customer_id: "",
    lead_id: "",
    type: "call",
    occurred_at: localDateTime(),
    staff_id: "",
    subject: "",
    description: "",
    outcome: "",
    next_follow_up_at: "",
  }));

  const set =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
      setStatus({ kind: "idle", message: "" });
    };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveInteractionAction({
      customer_id: form.customer_id,
      lead_id: form.lead_id,
      type: form.type,
      occurred_at: form.occurred_at,
      staff_id: form.staff_id,
      subject: form.subject,
      description: form.description,
      outcome: form.outcome,
      next_follow_up_at: form.next_follow_up_at,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({
      kind: "ok",
      message: form.next_follow_up_at
        ? `Logged. Follow-up noted for ${form.next_follow_up_at}.`
        : "Logged.",
    });
    // Keep who/what/when, clear the words — logging several calls in a row is
    // the normal case here.
    setForm((prev) => ({ ...prev, subject: "", description: "", outcome: "" }));
    router.refresh();
  }

  const labelClass = "text-[var(--ob-text-muted)]";

  return (
    <CrmPanel title="Log an interaction" meta="Recorded by you, dated on save">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className={labelClass}>Customer</span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                value={form.customer_id}
                onChange={set("customer_id")}
                aria-label="Customer this activity belongs to"
              >
                <option value="">Not a customer yet</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block text-sm">
            <span className={labelClass}>Lead</span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                value={form.lead_id}
                onChange={set("lead_id")}
                aria-label="Lead this activity belongs to"
              >
                <option value="">Not a lead</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Pick a customer, a lead, or both — one of them is required.
            </span>
          </label>
          <label className="block text-sm">
            <span className={labelClass}>
              Type<span className="ml-0.5 text-[var(--ob-danger)]">*</span>
            </span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                value={form.type}
                onChange={set("type")}
                aria-label="Interaction type"
              >
                {INTERACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {INTERACTION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block text-sm">
            <span className={labelClass}>
              When it happened<span className="ml-0.5 text-[var(--ob-danger)]">*</span>
            </span>
            <div className="mt-1">
              <Input
                type="datetime-local"
                value={form.occurred_at}
                onChange={set("occurred_at")}
                required
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className={labelClass}>Who handled it</span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                value={form.staff_id}
                onChange={set("staff_id")}
                aria-label="Staff member who handled it"
              >
                <option value="">Not recorded</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block text-sm">
            <span className={labelClass}>Next follow-up</span>
            <div className="mt-1">
              <Input
                type="date"
                value={form.next_follow_up_at}
                onChange={set("next_follow_up_at")}
              />
            </div>
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Set a date and this row can become one Productivity task.
            </span>
          </label>
        </div>

        <label className="block text-sm">
          <span className={labelClass}>Subject</span>
          <div className="mt-1">
            <Input
              value={form.subject}
              onChange={set("subject")}
              maxLength={120}
              placeholder="Callback about the quote"
            />
          </div>
        </label>

        <label className="block text-sm">
          <span className={labelClass}>
            What was said<span className="ml-0.5 text-[var(--ob-danger)]">*</span>
          </span>
          <div className="mt-1">
            <textarea
              className="ob-input min-h-24 w-full"
              value={form.description}
              onChange={set("description")}
              required
              maxLength={2000}
              placeholder="What was asked, what was agreed, what is owed…"
            />
          </div>
        </label>

        <label className="block text-sm">
          <span className={labelClass}>Outcome</span>
          <div className="mt-1">
            <Input
              value={form.outcome}
              onChange={set("outcome")}
              maxLength={200}
              placeholder="Callback agreed for Friday"
            />
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            Log interaction
          </Button>
          {status.kind !== "idle" ? (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              aria-live={status.kind === "error" ? "assertive" : "polite"}
              className={
                status.kind === "error"
                  ? "text-sm text-[var(--ob-danger)]"
                  : "text-sm text-[var(--crm-lab-strong)]"
              }
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </form>
    </CrmPanel>
  );
}
