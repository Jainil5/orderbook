"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markRecipientRedeemedAction,
  markRecipientRespondedAction,
  markRecipientSentAction,
} from "@/services/crm-campaign-actions";

/**
 * Recording what a human actually did for one person in a campaign.
 *
 * There is no send button: "mark sent" only stores the fact that somebody
 * contacted this person, with the time it was recorded. A redemption may carry
 * the real order that used the offer, which is what makes `revenue_attributed`
 * mean something.
 */
export function RecipientOutcomeControls({
  recipientId,
  contactable,
  markedSentAt,
  respondedAt,
  redeemedAt,
  orders,
}: {
  recipientId: string;
  /** False for anyone the consent gate keeps out of the audience. */
  contactable: boolean;
  markedSentAt: string | null;
  respondedAt: string | null;
  redeemedAt: string | null;
  /** This customer's own orders, for attribution. */
  orders: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  async function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setStatus({ kind: "idle", message: "" });
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message ?? "That was not recorded." });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Recorded." });
    setOpen(false);
    router.refresh();
  }

  if (!contactable) {
    return (
      <p className="text-xs text-[var(--ob-text-muted)]">
        Outside the consent gate — recording a contact for this row is refused
        until marketing consent is granted on their profile.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={markedSentAt ? "secondary" : "primary"}
          className="px-2.5 py-1.5 text-xs"
          loading={busy === "sent"}
          disabled={busy !== null}
          onClick={() => run("sent", () => markRecipientSentAction(recipientId))}
        >
          {markedSentAt ? "Already marked sent" : "Mark sent"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-2.5 py-1.5 text-xs"
          loading={busy === "responded"}
          disabled={busy !== null}
          onClick={() => run("responded", () => markRecipientRespondedAction(recipientId))}
        >
          {respondedAt ? "Response recorded" : "Mark responded"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-2.5 py-1.5 text-xs"
          disabled={busy !== null}
          onClick={() => setOpen((prev) => !prev)}
        >
          {redeemedAt ? "Record another redemption" : "Mark redeemed"}
        </Button>
      </div>

      {open ? (
        <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-2">
          <p className="mb-2 text-xs text-[var(--ob-text-muted)]">
            Attaching an order is what lets OrderBook credit real revenue to this
            campaign. Leave it blank if the offer was used without a recorded
            order — then no revenue is attributed.
          </p>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">
              Order to attribute (optional)
            </span>
            <select
              className="ob-input mt-1 w-full"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">No order linked</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-sm">
            <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
            <Input
              className="mt-1"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Used DIWALI15 at the counter"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              className="px-3 py-1.5 text-xs"
              loading={busy === "redeemed"}
              disabled={busy !== null}
              onClick={() =>
                run("redeemed", () =>
                  markRecipientRedeemedAction(
                    recipientId,
                    orderId || null,
                    note || null,
                  ),
                )
              }
            >
              Record redemption
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {status.kind !== "idle" ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error"
              ? "text-xs text-[var(--ob-danger)]"
              : "text-xs text-[var(--crm-lab-strong)]"
          }
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
