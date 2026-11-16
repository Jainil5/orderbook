"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import {
  setCustomerArchivedAction,
  setMarketingConsentAction,
  toggleCustomerTagAction,
} from "@/services/crm-customer-actions";

/**
 * The three decisions an owner actually makes at a counter: may we market to
 * this person, is one of our tags right, and is this record still live.
 *
 * Each one is its own server action — no form round-trips the whole profile
 * just to change a single field.
 */
export function CustomerQuickActions({
  customerId,
  name,
  consent,
  optedOutAt,
  tags,
  status,
  canManage,
}: {
  customerId: string;
  name: string;
  consent: "granted" | "declined" | null;
  optedOutAt: string | null;
  tags: string[];
  status: "archived" | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  async function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setError(result.message ?? "That did not save.");
      return;
    }
    router.refresh();
  }

  return (
    <CrmPanel title="Decisions" meta={`Consent: ${consent ?? "never asked"}`}>
      <div className="space-y-4">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
            Marketing consent
          </h4>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Campaigns may only include people recorded as “granted”. Declining
            or opting out is dated and removes them from every audience.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={consent === "granted" ? "primary" : "secondary"}
              disabled={busy !== null}
              loading={busy === "grant"}
              onClick={() => run("grant", () => setMarketingConsentAction(customerId, "granted"))}
            >
              Granted
            </Button>
            <Button
              type="button"
              variant={consent === "declined" ? "primary" : "secondary"}
              disabled={busy !== null}
              loading={busy === "decline"}
              onClick={() =>
                run("decline", () => setMarketingConsentAction(customerId, "declined"))
              }
            >
              Declined
            </Button>
            {optedOutAt ? (
              <CrmChip tone="danger">opted out {optedOutAt.slice(0, 10)}</CrmChip>
            ) : null}
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
            Tags
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.length === 0 ? (
              <span className="text-sm text-[var(--ob-text-muted)]">No tags yet.</span>
            ) : null}
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={busy !== null}
                title={`Remove “${tag}”`}
                onClick={() => run(`tag-${tag}`, () => toggleCustomerTagAction(customerId, tag))}
                className="ob-touch-target inline-flex items-center gap-1 rounded-full border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2 py-0.5 text-xs text-[var(--crm-leaf)] hover:border-[var(--crm-lab)]"
              >
                {tag}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = tagDraft.trim();
              if (!value) return;
              setTagDraft("");
              void run("tag-new", () => toggleCustomerTagAction(customerId, value));
            }}
          >
            <Input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              placeholder="Add a tag"
              aria-label={`Add a tag for ${name}`}
              className="max-w-40"
            />
            <Button type="submit" variant="secondary" disabled={busy !== null || !tagDraft.trim()}>
              Add
            </Button>
          </form>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
            Record
          </h4>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Archiving keeps every past order and stops the customer appearing
            in new audiences. The CRM never deletes a customer.
          </p>
          {!canManage ? (
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              Only owners, admins and managers can archive a customer.
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              disabled={busy !== null}
              loading={busy === "archive"}
              onClick={() =>
                run("archive", () =>
                  setCustomerArchivedAction(customerId, status !== "archived"),
                )
              }
            >
              {status === "archived" ? "Restore customer" : "Archive customer"}
            </Button>
          )}
        </section>

        {error ? (
          <p role="alert" className="text-sm text-[var(--ob-danger)]">
            {error}
          </p>
        ) : null}
      </div>
    </CrmPanel>
  );
}
