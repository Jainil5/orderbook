"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LoyaltyField,
  LoyaltyFormStatus,
  LoyaltySelect,
} from "@/components/crm/loyalty/loyalty-field";
import {
  createMembershipAction,
  renewMembershipAction,
  setMembershipStatusAction,
} from "@/services/crm-loyalty-actions";
import type { MembershipStatus } from "@/types/crm";

type Status = { kind: "idle" | "ok" | "error"; message: string };

/**
 * A membership is a promise the business made to one customer, in its own
 * words: the plan name, the benefits and the price are typed here and stored
 * on the row. There is no plan catalogue and no payment — the price records
 * what was agreed, it is not charged by anything in this app.
 */
export function MembershipCreateForm({
  customers,
  defaultCustomerId,
}: {
  customers: { id: string; name: string }[];
  defaultCustomerId: string | null;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [plan, setPlan] = useState("");
  const [price, setPrice] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [benefits, setBenefits] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus({ kind: "idle", message: "" });
    const result = await createMembershipAction({
      customer_id: customerId,
      plan,
      price,
      started_at: startedAt,
      ends_at: endsAt,
      auto_renew: autoRenew,
      benefits,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Saved." });
    setPlan("");
    setPrice("");
    setBenefits("");
    setEndsAt("");
    setStartedAt("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <LoyaltyField label="Customer" required>
          <LoyaltySelect
            value={customerId}
            onChange={setCustomerId}
            placeholder="Pick a customer…"
            options={customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            }))}
          />
        </LoyaltyField>
        <LoyaltyField
          label="Plan name"
          required
          hint="Your words for it — “Design Club”, “Filter Coffee Club”, anything."
        >
          <Input
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            maxLength={80}
            required
          />
        </LoyaltyField>
        <LoyaltyField
          label="Price"
          hint="Recorded on the membership so the record says what was agreed. Nothing charges it."
        >
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0"
          />
        </LoyaltyField>
        <label className="ob-touch-target flex items-start gap-3 rounded-md border border-[var(--ob-border)] px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(event) => setAutoRenew(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--crm-lab-strong)]"
            aria-label="Auto-renew"
          />
          <span>
            <span className="text-[var(--ob-text-muted)]">Auto-renew</span>
            <span className="mt-0.5 block text-xs text-[var(--ob-text-muted)]">
              A flag on the record: nothing renews a membership by itself, so
              this is the list of who to call.
            </span>
          </span>
        </label>
        <LoyaltyField label="Started on" hint="Blank means today.">
          <Input
            type="date"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
          />
        </LoyaltyField>
        <LoyaltyField label="Ends on" hint="Blank means no end date was agreed.">
          <Input
            type="date"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </LoyaltyField>
      </div>
      <LoyaltyField
        label="Benefits"
        hint="One per line. Shown on the customer’s 360° page."
      >
        <textarea
          className="ob-input min-h-24 w-full"
          value={benefits}
          onChange={(event) => setBenefits(event.target.value)}
          placeholder={"Free 3D room layout\nPriority delivery slots"}
        />
      </LoyaltyField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={!customerId || !plan.trim()}>
          Start membership
        </Button>
        <LoyaltyFormStatus status={status} />
      </div>
    </form>
  );
}

/**
 * Renew, pause, resume or cancel. Renewing optionally moves the end date —
 * leaving it blank reactivates the membership with the term it already had,
 * because the length of a term is the business's decision, not this screen's.
 */
export function MembershipRowActions({
  id,
  plan,
  status,
}: {
  id: string;
  plan: string;
  status: MembershipStatus;
}) {
  const router = useRouter();
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Status>({ kind: "idle", message: "" });

  async function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMessage({ kind: "idle", message: "" });
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setMessage({ kind: "error", message: result.message ?? "That did not save." });
      return;
    }
    setMessage({ kind: "ok", message: result.message ?? `${plan} updated.` });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          loading={busy === "renew"}
          disabled={busy !== null}
          onClick={() => run("renew", () => renewMembershipAction(id, endsAt))}
        >
          Renew
        </Button>
        {status === "active" ? (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            loading={busy === "pause"}
            disabled={busy !== null}
            onClick={() => run("pause", () => setMembershipStatusAction(id, "paused"))}
          >
            Pause
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            loading={busy === "resume"}
            disabled={busy !== null}
            onClick={() => run("resume", () => setMembershipStatusAction(id, "active"))}
          >
            Resume
          </Button>
        )}
        {status !== "cancelled" ? (
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-1.5 text-xs text-[var(--crm-rust)]"
            loading={busy === "cancel"}
            disabled={busy !== null}
            onClick={() => run("cancel", () => setMembershipStatusAction(id, "cancelled"))}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      <LoyaltyField
        label="Renew until"
        hint="Blank reactivates with the end date it already has."
      >
        <Input
          type="date"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          aria-label={`Renew ${plan} until`}
        />
      </LoyaltyField>
      <LoyaltyFormStatus status={message} />
    </div>
  );
}
