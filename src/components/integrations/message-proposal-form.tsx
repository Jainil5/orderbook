"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { proposeWhatsAppMessageAction } from "@/services/integrations-actions";

/**
 * Turns a typed WhatsApp message into a *proposal*, not a send.
 *
 * The queue below this form is the only thing that can put a message on the
 * wire, and it needs a confirmation click. Links are refused here as well as in
 * the adapter: an automated message with a URL is how business numbers get
 * restricted, and the preview must match what would go out.
 */

const LINKISH = /(https?:\/\/|wa\.me|bit\.ly|tinyurl)/i;

export function MessageProposalForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const linkInBody = LINKISH.test(body);

  async function submit() {
    if (pending || linkInBody) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await proposeWhatsAppMessageAction({ to, body });
      setMessage(result.message);
      if (result.ok) {
        setTo("");
        setBody("");
        router.refresh();
      } else {
        setFailed(true);
      }
    } catch {
      setMessage("The request did not complete. Nothing was sent.");
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold">Propose a WhatsApp message</h3>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Use this for one-off reminders and order updates. The message waits in the
        queue for you to confirm it, and OrderBook never sends on a timer.
      </p>
      {!configured ? (
        <p className="mt-2 rounded-md bg-[var(--ob-surface-muted)] p-2 text-xs text-[var(--ob-text-secondary)]">
          WhatsApp is not configured on this server yet, so a confirmed message will
          fail with a clear error instead of sending.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,220px),1fr]">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--ob-text-muted)]">
            Number in international format
          </span>
          <input
            className="ob-input w-full"
            inputMode="tel"
            autoComplete="off"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="+91 98200 12345"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--ob-text-muted)]">
            Message ({body.length}/480)
          </span>
          <textarea
            className="ob-input min-h-20 w-full"
            value={body}
            maxLength={480}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Your order is ready for pickup at the shop."
          />
        </label>
      </div>

      {linkInBody ? (
        <p role="alert" className="mt-2 text-xs text-[var(--ob-danger)]">
          Automated messages cannot contain links.
        </p>
      ) : null}
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-2 text-xs ${
            failed ? "text-[var(--ob-danger)]" : "text-[var(--ob-success)]"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="mt-3">
        <Button
          variant="secondary"
          disabled={pending || linkInBody || to.trim().length === 0 || body.trim().length < 2}
          loading={pending}
          onClick={() => void submit()}
        >
          Add to confirmation queue
        </Button>
      </div>
    </Card>
  );
}
