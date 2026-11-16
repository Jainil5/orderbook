"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteSegmentAction } from "@/services/crm-segment-actions";

/**
 * Delete a saved segment. One click arms the button, a second deletes — no
 * browser dialogs. The action refuses while a campaign still points at the
 * segment, and that refusal is shown right here.
 */
export function SegmentDeleteButton({
  segmentId,
  segmentName,
}: {
  segmentId: string;
  segmentName: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  async function onDelete() {
    setBusy(true);
    const result = await deleteSegmentAction(segmentId);
    setBusy(false);
    setArmed(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Segment deleted." });
    router.replace("/customers/segments");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {armed ? (
        <Button
          type="button"
          variant="danger"
          className="px-3 py-1.5 text-xs"
          loading={busy}
          onClick={onDelete}
        >
          Confirm delete “{segmentName}”
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => {
            setArmed(true);
            setStatus({ kind: "idle", message: "" });
          }}
        >
          Delete segment
        </Button>
      )}
      {armed ? (
        <button
          type="button"
          className="ob-touch-target text-xs text-[var(--ob-text-muted)] underline"
          onClick={() => setArmed(false)}
        >
          Keep it
        </button>
      ) : null}
      {status.kind !== "idle" ? (
        <span
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error"
              ? "text-xs text-[var(--ob-danger)]"
              : "text-xs text-[var(--crm-lab-strong)]"
          }
        >
          {status.message}
        </span>
      ) : null}
    </span>
  );
}
