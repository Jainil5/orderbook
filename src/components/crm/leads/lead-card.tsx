"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmChip, CrmStageChip } from "@/components/crm/crm-ui";
import { LeadForm } from "@/components/crm/leads/lead-form";
import {
  convertLeadAction,
  deleteLeadAction,
  logLeadFollowUpAction,
  moveLeadStageAction,
} from "@/services/crm-lead-actions";
import { formatMoney } from "@/lib/format";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type Lead,
  type LeadStage,
} from "@/types/crm";

/**
 * One pipeline card.
 *
 * Client component because the card itself is interactive — it opens from the
 * `?id=` deep link, expands, and hosts the editor. The writes are still plain
 * HTML form posts to the lead actions, so a stage move, a conversion or a
 * follow-up date needs no bundle and reports itself through the page notice.
 */
export function LeadCard({
  lead,
  staff,
  sources,
  currencyCode,
  asOf,
  ownerName,
  convertedCustomer,
  canLog,
  canManage,
  focused = false,
}: {
  lead: Lead;
  staff: { id: string; name: string }[];
  sources: string[];
  currencyCode: string;
  asOf: string;
  ownerName: string | null;
  convertedCustomer: { id: string; name: string } | null;
  canLog: boolean;
  canManage: boolean;
  /** Opened by `?id=` — expand and bring it into view. */
  focused?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  /**
   * `?id=` opens the card; a click on the toggle then wins. Derived instead of
   * synced from an effect, so a client-side navigation to another `?id=` opens
   * the right card without a cascading render.
   */
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? focused;
  const [editing, setEditing] = useState(false);
  const [targetStage, setTargetStage] = useState<LeadStage>(lead.stage);

  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);

  const customerHref = lead.customer_id
    ? { id: lead.customer_id, name: convertedCustomer?.name ?? "Customer" }
    : null;
  const overdue =
    lead.next_follow_up_at !== null &&
    lead.next_follow_up_at.slice(0, 10) < asOf.slice(0, 10);

  return (
    <li
      ref={ref}
      id={`lead-${lead.id}`}
      className="crm-surface rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            aria-pressed={expanded}
            onClick={() => setToggled(!expanded)}
            className="ob-touch-target max-w-full truncate text-left text-sm font-semibold hover:underline"
          >
            {lead.name}
          </button>
          <p className="mt-0.5 truncate text-xs text-[var(--ob-text-muted)]">
            {[lead.company, lead.phone, lead.email].filter(Boolean).join(" · ") ||
              "No contact details"}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(lead.estimated_value, currencyCode)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <CrmStageChip stage={lead.stage} label={LEAD_STAGE_LABELS[lead.stage]} />
        {lead.source ? <CrmChip>{lead.source}</CrmChip> : null}
        <CrmChip tone={ownerName ? "ink" : "neutral"}>
          {ownerName ?? "Unassigned"}
        </CrmChip>
        {lead.next_follow_up_at ? (
          <CrmChip tone={overdue ? "danger" : "neutral"}>
            {overdue ? "Overdue" : "Follow-up"} {lead.next_follow_up_at.slice(0, 10)}
          </CrmChip>
        ) : null}
        {lead.lost_reason ? (
          <CrmChip tone="danger">Lost: {lead.lost_reason}</CrmChip>
        ) : null}
        {customerHref ? (
          <Link
            href={`/customers/${customerHref.id}`}
            className="ob-touch-target text-[var(--ob-primary)] hover:underline"
          >
            {customerHref.name} →
          </Link>
        ) : null}
      </div>

      {canLog ? (
        <div className="mt-2">
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((value) => !value)}
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-2 py-1 text-xs text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]"
          >
            {editing ? "Close editor" : "Edit details"}
          </button>
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3">
          <LeadForm
            lead={lead}
            staff={staff}
            sources={sources}
            currencyCode={currencyCode}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-[var(--crm-wash-line)] pt-3">
          <p className="text-sm text-[var(--ob-text-secondary)]">
            {lead.notes || "No notes yet."}
          </p>

          {canLog ? (
            <>
              <form
                action={moveLeadStageAction}
                className="space-y-2 rounded-md bg-[var(--ob-surface)] p-3"
              >
                <input type="hidden" name="id" value={lead.id} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block text-xs">
                    <span className="text-[var(--ob-text-muted)]">Move to stage</span>
                    <div className="mt-1">
                      <select
                        className="ob-input"
                        name="stage"
                        value={targetStage}
                        onChange={(event) =>
                          setTargetStage(event.target.value as LeadStage)
                        }
                        aria-label={`Move ${lead.name} to a stage`}
                      >
                        {LEAD_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {LEAD_STAGE_LABELS[stage]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    disabled={targetStage === lead.stage}
                  >
                    Move
                  </Button>
                </div>
                <p className="text-xs text-[var(--ob-text-muted)]">
                  Moving records the stage change;{" "}
                  {targetStage === "lost"
                    ? "the reason below is required."
                    : "a lost lead needs its reason."}
                </p>
                {targetStage === "lost" ? (
                  <label className="block text-xs">
                    <span className="text-[var(--ob-text-muted)]">
                      Reason lost (required)
                    </span>
                    <div className="mt-1">
                      <Input
                        name="lost_reason"
                        defaultValue={lead.lost_reason ?? ""}
                        required
                        maxLength={200}
                        placeholder="Price, timing, went with a competitor…"
                      />
                    </div>
                  </label>
                ) : (
                  <input
                    type="hidden"
                    name="lost_reason"
                    value={lead.lost_reason ?? ""}
                  />
                )}
              </form>

              <div className="grid gap-2 sm:grid-cols-2">
                <form
                  action={logLeadFollowUpAction}
                  className="space-y-2 rounded-md border border-[var(--ob-border)] p-3"
                >
                  <input type="hidden" name="id" value={lead.id} />
                  <label className="block text-xs">
                    <span className="text-[var(--ob-text-muted)]">
                      Next follow-up date
                    </span>
                    <div className="mt-1">
                      <Input
                        type="date"
                        name="next_follow_up_at"
                        required
                        defaultValue={
                          lead.next_follow_up_at
                            ? lead.next_follow_up_at.slice(0, 10)
                            : ""
                        }
                      />
                    </div>
                  </label>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                  >
                    Set follow-up
                  </Button>
                </form>

                {!lead.customer_id ? (
                  <form
                    action={convertLeadAction}
                    className="space-y-2 rounded-md border border-[var(--ob-border)] p-3"
                  >
                    <input type="hidden" name="id" value={lead.id} />
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      Creates the customer through the existing customer record
                      the app already has, marks this lead won and links it —
                      never a second customer.
                    </p>
                    <Button type="submit" className="px-3 py-1.5 text-xs">
                      Convert to customer
                    </Button>
                  </form>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--ob-text-muted)]">
              Your role can read the pipeline but not record activity on it.
            </p>
          )}

          {canManage ? (
            <form
              action={deleteLeadAction}
              className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--ob-border)] p-3"
            >
              <input type="hidden" name="id" value={lead.id} />
              <label className="flex items-center gap-2 text-xs text-[var(--ob-text-muted)]">
                <input type="checkbox" name="confirm" className="h-4 w-4" />
                Delete this lead permanently
              </label>
              <Button
                type="submit"
                variant="danger"
                className="px-3 py-1.5 text-xs"
              >
                Delete lead
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
