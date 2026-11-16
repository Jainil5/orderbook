"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  EMPTY_INTERACTION_INPUT,
  dueFollowUps,
  isFollowUpDue,
  sortInteractions,
  taskDraftFromInteraction,
  upcomingFollowUps,
  type InteractionInput,
} from "@/lib/crm/interactions";
import { toLocalInputValue } from "@/lib/manager/time";
import { useMounted } from "@/lib/use-mounted";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  type CustomerInteraction,
  type InteractionType,
} from "@/types/crm";
import {
  completeFollowUpAction,
  createTaskFromInteractionAction,
  deleteInteractionAction,
  saveInteractionAction,
} from "@/services/crm-actions";

type Option = { id: string; name: string };

function toInput(interaction: CustomerInteraction): InteractionInput {
  return {
    customer_id: interaction.customer_id ?? "",
    lead_id: interaction.lead_id ?? "",
    type: interaction.type,
    summary: interaction.summary,
    detail: interaction.detail ?? "",
    occurred_at: toLocalInputValue(interaction.occurred_at),
    staff_id: interaction.staff_id ?? "",
    outcome: interaction.outcome ?? "",
    next_follow_up_at: interaction.next_follow_up_at
      ? toLocalInputValue(interaction.next_follow_up_at)
      : "",
    attachment_url: interaction.attachment_url ?? "",
  };
}

/**
 * The contact log. Follow-ups are not a second task system: a due follow-up
 * becomes a card on the Productivity Manager's existing board, and closing it
 * here closes that task too.
 */
export function InteractionsManager({
  interactions,
  customers,
  staff,
  leads,
  initialCustomerId,
}: {
  interactions: CustomerInteraction[];
  customers: Option[];
  staff: Option[];
  leads: Option[];
  /** Set from `?customer=` so a Customer 360 link lands with the member chosen. */
  initialCustomerId?: string | null;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<InteractionInput>({
    ...EMPTY_INTERACTION_INPUT,
    customer_id: initialCustomerId ?? "",
  });
  const [editing, setEditing] = useState<CustomerInteraction | null>(null);
  const [closing, setClosing] = useState<CustomerInteraction | null>(null);
  const [outcome, setOutcome] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | InteractionType>("");
  const [dueOnly, setDueOnly] = useState(false);

  const patch = (fields: Partial<InteractionInput>) =>
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

  function startEdit(interaction: CustomerInteraction | null) {
    setEditing(interaction);
    setForm(
      interaction
        ? toInput(interaction)
        : { ...EMPTY_INTERACTION_INPUT, customer_id: initialCustomerId ?? "" },
    );
    setError(null);
  }

  function startClose(interaction: CustomerInteraction) {
    setClosing(interaction);
    setOutcome(interaction.outcome ?? "");
    setError(null);
    dialogRef.current?.showModal();
  }

  const mounted = useMounted();
  const now = new Date();
  const ordered = sortInteractions(interactions);
  const due = mounted ? dueFollowUps(interactions, now) : [];
  const upcoming = mounted ? upcomingFollowUps(interactions, now) : [];
  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((item) => item.id === id)?.name ?? "Unknown" : null;

  const visible = ordered.filter((interaction) => {
    if (typeFilter && interaction.type !== typeFilter) return false;
    if (dueOnly && !interaction.next_follow_up_at) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Logged" value={String(interactions.length)} hint="Touchpoints on record" />
        <StatCard
          label="Follow-ups due"
          value={mounted ? String(due.length) : "—"}
          tone={due.length ? "down" : "neutral"}
          hint="Past the date, nobody has closed them"
        />
        <StatCard
          label="Coming up"
          value={mounted ? String(upcoming.length) : "—"}
          hint="Scheduled and still ahead"
        />
        <StatCard
          label="Become tasks"
          value={String(interactions.filter((i) => i.task_id).length)}
          hint="Handed to the Manager board"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      {due.length ? (
        <Card className="p-4">
          <h2 className="font-semibold">Due now</h2>
          <ul className="mt-2 space-y-2">
            {due.slice(0, 5).map((interaction) => (
              <li key={interaction.id} className="text-sm">
                <button
                  type="button"
                  className="text-[var(--ob-primary)] hover:underline"
                  onClick={() => startClose(interaction)}
                >
                  {interaction.summary}
                </button>
                <span className="text-[var(--ob-text-muted)]">
                  {" "}
                  — {nameOf(customers, interaction.customer_id) ?? "a lead"} · due{" "}
                  {mounted ? formatDate(interaction.next_follow_up_at!) : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="font-semibold">{editing ? "Edit interaction" : "Log an interaction"}</h2>
        {initialCustomerId && !editing ? (
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Pre-filled for{" "}
            <span className="font-semibold text-[var(--ob-text)]">
              {nameOf(customers, initialCustomerId) ?? "this customer"}
            </span>{" "}
            — the log below still shows everyone.
          </p>
        ) : null}
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveInteractionAction(editing?.id ?? null, form));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer</span>
            <select
              className="ob-input mt-1 w-full"
              value={form.customer_id}
              onChange={(e) => patch({ customer_id: e.target.value, lead_id: "" })}
              disabled={pending}
            >
              <option value="">A lead instead</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Or enquiry</span>
            <select
              className="ob-input mt-1 w-full"
              value={form.lead_id}
              onChange={(e) => patch({ lead_id: e.target.value, customer_id: "" })}
              disabled={pending}
            >
              <option value="">A customer instead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Type</span>
            <select
              className="ob-input mt-1 w-full"
              value={form.type}
              onChange={(e) => patch({ type: e.target.value })}
              disabled={pending}
            >
              {INTERACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INTERACTION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--ob-text-muted)]">Summary</span>
            <input
              className="ob-input mt-1 w-full"
              value={form.summary}
              onChange={(e) => patch({ summary: e.target.value })}
              maxLength={200}
              required
              placeholder="Called about the delayed sofa delivery"
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">When</span>
            <input
              className="ob-input mt-1 w-full"
              type="datetime-local"
              value={form.occurred_at}
              onChange={(e) => patch({ occurred_at: e.target.value })}
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Who handled it</span>
            <select
              className="ob-input mt-1 w-full"
              value={form.staff_id}
              onChange={(e) => patch({ staff_id: e.target.value })}
              disabled={pending}
            >
              <option value="">Nobody in particular</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Outcome (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              value={form.outcome}
              onChange={(e) => patch({ outcome: e.target.value })}
              maxLength={160}
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Follow up on (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              type="datetime-local"
              value={form.next_follow_up_at}
              onChange={(e) => patch({ next_follow_up_at: e.target.value })}
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Attachment link (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              type="url"
              value={form.attachment_url}
              onChange={(e) => patch({ attachment_url: e.target.value })}
              placeholder="https://…"
              disabled={pending}
            />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-[var(--ob-text-muted)]">Detail</span>
            <textarea
              className="ob-input mt-1 min-h-20 w-full"
              value={form.detail}
              onChange={(e) => patch({ detail: e.target.value })}
              maxLength={2000}
              disabled={pending}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Log it"}
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={dueOnly}
          className={cn(
            "ob-press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
            dueOnly
              ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
              : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)]",
          )}
          onClick={() => setDueOnly((prev) => !prev)}
        >
          With a follow-up
        </button>
        <label className="text-sm">
          <span className="sr-only">Filter by type</span>
          <select
            className="ob-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | InteractionType)}
          >
            <option value="">Every type</option>
            {INTERACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {INTERACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-[var(--ob-text-muted)]">
          <span className="ob-num">{visible.length}</span> shown
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          description="Calls, visits, messages and complaints all land here, so the next person to pick up the phone knows what was said."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((interaction) => {
            const overdue = mounted && isFollowUpDue(interaction, now);
            const draft = taskDraftFromInteraction(interaction);
            const customerName = nameOf(customers, interaction.customer_id);
            const leadName = nameOf(leads, interaction.lead_id);
            return (
              <Card
                key={interaction.id}
                className={cn("p-4", overdue && "border border-[var(--ob-danger)]!")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {interaction.summary}
                      <Badge tone="neutral" className="ml-2">
                        {INTERACTION_TYPE_LABELS[interaction.type]}
                      </Badge>
                      {overdue ? (
                        <Badge tone="danger" className="ml-2">
                          Follow-up due
                        </Badge>
                      ) : interaction.next_follow_up_at ? (
                        <Badge tone="warning" className="ml-2">
                          Follow-up set
                        </Badge>
                      ) : null}
                      {interaction.task_id ? (
                        <Badge tone="success" className="ml-2">
                          On the task board
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {customerName ? (
                        <Link
                          href={`/customers/${interaction.customer_id}`}
                          className="text-[var(--ob-primary)] hover:underline"
                        >
                          {customerName}
                        </Link>
                      ) : leadName ? (
                        <Link
                          href="/customers/leads"
                          className="text-[var(--ob-primary)] hover:underline"
                        >
                          {leadName}
                        </Link>
                      ) : (
                        "Nobody attached"
                      )}
                      {nameOf(staff, interaction.staff_id)
                        ? ` · ${nameOf(staff, interaction.staff_id)}`
                        : ""}
                      {mounted ? ` · ${formatDate(interaction.occurred_at)}` : ""}
                    </p>
                    {interaction.detail ? (
                      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                        {interaction.detail}
                      </p>
                    ) : null}
                    {interaction.outcome ? (
                      <p className="mt-1 text-sm">Outcome: {interaction.outcome}</p>
                    ) : null}
                    {interaction.next_follow_up_at && mounted ? (
                      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                        Follow up {formatDate(interaction.next_follow_up_at)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {interaction.next_follow_up_at ? (
                      <button
                        type="button"
                        className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                        disabled={pending}
                        onClick={() => startClose(interaction)}
                      >
                        Mark done
                      </button>
                    ) : null}
                    {interaction.task_id ? (
                      <Link
                        href="/manager/tasks"
                        className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
                      >
                        View task
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                        disabled={pending}
                        title={draft.title}
                        onClick={() => run(() => createTaskFromInteractionAction(interaction.id))}
                      >
                        Make a task
                      </button>
                    )}
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => startEdit(interaction)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => run(() => deleteInteractionAction(interaction.id))}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(100%,28rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!closing) return;
            const ok = await run(() => completeFollowUpAction(closing.id, outcome));
            if (ok) {
              dialogRef.current?.close();
              setClosing(null);
            }
          }}
        >
          <h2 className="font-semibold">Close the follow-up</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            {closing?.summary}
            {closing?.task_id ? " — the task it made on the Manager board closes with it." : ""}
          </p>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">What happened</span>
            <input
              className="ob-input mt-1 w-full"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              maxLength={160}
              placeholder="Delivered, customer happy"
              disabled={pending}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Mark done"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
