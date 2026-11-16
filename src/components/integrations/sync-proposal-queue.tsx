"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  confirmSyncAction,
  dismissSyncAction,
} from "@/services/integrations-actions";
import { ACTION_TYPE_LABELS } from "@/lib/integrations/labels";
import type { PendingSyncAction } from "@/types/integrations";

/**
 * Review queue for everything OrderBook wants to do *outside* the product.
 *
 * Nothing here runs on a timer or on page load: a proposal leaves only when
 * this button is pressed, which is the confirmation step the integration
 * policy requires. Payloads are shown key by key from a whitelist so a stored
 * row can never render as an opaque provider blob.
 */

const PREVIEW_KEYS = [
  "summary",
  "startsAt",
  "endsAt",
  "location",
  "description",
  "customerName",
  "to",
  "subject",
  "body",
  "name",
] as const;

function preview(action: PendingSyncAction): { key: string; value: string }[] {
  return PREVIEW_KEYS.flatMap((key) => {
    const value = action.payload[key];
    if (typeof value !== "string" || value.trim().length === 0) return [];
    return [{ key, value: value.slice(0, 240) }];
  });
}

export function SyncProposalQueue({
  actions,
  canManage,
  calendarLabel,
}: {
  actions: PendingSyncAction[];
  canManage: boolean;
  calendarLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(id);
    try {
      const result = await fn();
      setNotice(result.message);
      if (result.ok) router.refresh();
    } catch {
      setNotice("The request did not complete. Nothing was sent.");
    } finally {
      setBusy(null);
    }
  }

  if (actions.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting to go out"
        description={`When the assistant or a booking suggests a change in ${calendarLabel}, it lands here for you to approve first.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-[var(--ob-warning)]">
          {notice}
        </p>
      ) : null}
      {actions.map((action) => (
        <Card key={action.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{action.summary}</p>
              <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                {ACTION_TYPE_LABELS[action.type]} · proposed{" "}
                {new Date(action.createdAt).toLocaleString()}
              </p>
            </div>
            <Badge tone={action.status === "failed" ? "danger" : "warning"}>
              {action.status === "failed" ? "Failed last attempt" : "Awaiting your confirmation"}
            </Badge>
          </div>

          <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
            {preview(action).map((row) => (
              <div key={row.key} className="flex gap-1">
                <dt className="font-medium capitalize text-[var(--ob-text-muted)]">{row.key}</dt>
                <dd className="min-w-0 break-words text-[var(--ob-text-secondary)]">{row.value}</dd>
              </div>
            ))}
          </dl>

          {action.error ? (
            <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-[var(--ob-danger)]">
              {action.error} — discard this and propose the change again.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canManage && action.status !== "failed" ? (
              <Button
                disabled={busy === action.id}
                onClick={() => void run(action.id, () => confirmSyncAction(action.id))}
              >
                Confirm and send
              </Button>
            ) : null}
            {canManage ? (
              <Button
                variant="ghost"
                disabled={busy === action.id}
                onClick={() => void run(action.id, () => dismissSyncAction(action.id))}
              >
                Discard
              </Button>
            ) : null}
            <p className="text-xs text-[var(--ob-text-muted)]">
              {action.status === "failed"
                ? "Reconnect the account, then propose the change again."
                : `Nothing reaches ${action.integration.replace("_", " ")} until you confirm.`}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
