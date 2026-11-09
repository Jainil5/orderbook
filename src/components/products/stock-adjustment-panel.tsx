"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordStockAdjustmentAction } from "@/services/operations-actions";
import type { StockAdjustment } from "@/types/database";

export function StockAdjustmentPanel({
  productId,
  recent,
}: {
  productId: string;
  recent: StockAdjustment[];
}) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Rendered inside the product edit dialog's <form>; must not nest a second
  // <form> (invalid HTML + React hydration errors), so submit via button.
  async function submit() {
    if (busy || !delta.trim() || !reason.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await recordStockAdjustmentAction({
      productId,
      deltaQty: Number(delta),
      reason,
    });
    setBusy(false);
    if (result.ok) {
      setDelta("");
      setReason("");
      router.refresh();
    } else {
      setMessage("message" in result ? result.message : "Could not adjust.");
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <h3 className="text-sm font-semibold">Stock adjustment</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Qty change (+ receive, − sale)"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          required
        />
        <Input
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          required
        />
        <Button type="button" variant="secondary" loading={busy} onClick={submit}>
          Log adjustment
        </Button>
      </div>
      {message ? (
        <p role="alert" className="mt-2 text-xs text-[var(--ob-danger)]">{message}</p>
      ) : null}
      {recent.length ? (
        <ul className="mt-3 space-y-1 text-xs text-[var(--ob-text-muted)]">
          {recent.slice(0, 5).map((row) => (
            <li key={row.id}>
              {row.delta_qty > 0 ? "+" : ""}
              {row.delta_qty} · {row.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
