"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canEditOrderNotes } from "@/lib/orders/order-rules";
import type { Order } from "@/types/database";
import { updateOrderNotesAction } from "@/services/operations-actions";

export function OrderNotesEditor({ order }: { order: Order }) {
  const router = useRouter();
  const [notes, setNotes] = useState(order.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!canEditOrderNotes(order)) return null;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await updateOrderNotesAction(order.id, notes);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      setMessage("Saved.");
    } else {
      setMessage("message" in result ? result.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={onSave} className="ob-card space-y-2 p-4">
      <h2 className="text-sm font-semibold">Order notes</h2>
      <p className="text-xs text-[var(--ob-text-muted)]">
        Line items are locked after confirm. Notes can still be updated.
      </p>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" variant="secondary" loading={busy}>
        Save notes
      </Button>
      {message ? <p className="text-xs text-[var(--ob-text-muted)]">{message}</p> : null}
    </form>
  );
}
