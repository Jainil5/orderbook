"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPanel } from "@/components/crm/crm-ui";
import { saveLeadAction } from "@/services/crm-lead-actions";
import type { Lead } from "@/types/crm";

/** ISO (or `YYYY-MM-DD`) → the value `<input type="date">` expects. */
function dateValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Create or edit one lead.
 *
 * A client component so the panel can be opened, cancelled and focused without
 * a round trip, but the write itself is a plain HTML form post to
 * `saveLeadAction`: the outcome comes back in `?notice=` / `?error=` and works
 * with JavaScript switched off. `stage` is deliberately not in this form —
 * moving a lead is `moveLeadStageAction`'s job, so a lost lead always carries a
 * reason and the audit trail says "moved", never "saved".
 */
export function LeadForm({
  lead,
  staff,
  sources,
  currencyCode,
  autoFocus = false,
  onCancel,
}: {
  /** Null when creating; the stored row when editing. */
  lead: Lead | null;
  staff: { id: string; name: string }[];
  /** Source pick-list: this brand's configured sources plus anything in use. */
  sources: string[];
  currencyCode: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const sourceOptions = Array.from(
    new Set([...sources, lead?.source ?? ""].filter(Boolean)),
  ).sort();

  return (
    <CrmPanel
      title={lead ? `Edit ${lead.name}` : "New lead"}
      meta={
        lead
          ? `Stage ${lead.stage.replace("_", " ")} — use Move to change it`
          : "Starts at New"
      }
    >
      <form action={saveLeadAction} className="space-y-3">
        {lead ? <input type="hidden" name="id" value={lead.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">
              Lead name<span className="ml-0.5 text-[var(--ob-danger)]">*</span>
            </span>
            <div className="mt-1">
              <Input
                name="name"
                defaultValue={lead?.name ?? ""}
                required
                maxLength={120}
                autoFocus={autoFocus}
                placeholder="Person or account"
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Company</span>
            <div className="mt-1">
              <Input name="company" defaultValue={lead?.company ?? ""} maxLength={120} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Phone</span>
            <div className="mt-1">
              <Input name="phone" defaultValue={lead?.phone ?? ""} inputMode="tel" maxLength={40} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Email</span>
            <div className="mt-1">
              <Input
                type="email"
                name="email"
                defaultValue={lead?.email ?? ""}
                maxLength={160}
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Source</span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                name="source"
                defaultValue={lead?.source ?? ""}
                aria-label="Lead source"
              >
                <option value="">Not recorded</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Owner</span>
            <div className="mt-1">
              <select
                className="ob-input w-full"
                name="assigned_staff_id"
                defaultValue={lead?.assigned_staff_id ?? ""}
                aria-label="Assigned staff member"
              >
                <option value="">Unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Estimated value</span>
            <div className="mt-1">
              <Input
                name="estimated_value"
                defaultValue={
                  lead ? String(lead.estimated_value) : ""
                }
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Used to rank the pipeline ({currencyCode}). Never booked as revenue.
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Next follow-up</span>
            <div className="mt-1">
              <Input
                type="date"
                name="next_follow_up_at"
                defaultValue={dateValue(lead?.next_follow_up_at ?? null)}
              />
            </div>
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Drives the follow-ups-due list on the CRM overview.
            </span>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--ob-text-muted)]">Notes</span>
          <div className="mt-1">
            <textarea
              className="ob-input min-h-24 w-full"
              name="notes"
              defaultValue={lead?.notes ?? ""}
              maxLength={2000}
              placeholder="What was asked for, measurements, who decides…"
            />
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">{lead ? "Save lead" : "Add lead"}</Button>
          {onCancel ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          ) : lead?.customer_id ? (
            <Link
              href={`/customers/${lead.customer_id}`}
              className="ob-touch-target text-sm text-[var(--ob-primary)]"
            >
              Open the customer this lead became →
            </Link>
          ) : null}
        </div>
      </form>
    </CrmPanel>
  );
}
