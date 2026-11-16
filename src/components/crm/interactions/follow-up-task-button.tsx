"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createFollowUpTaskAction } from "@/services/crm-interaction-actions";

/**
 * Turn one logged follow-up into a single Productivity task.
 *
 * The button only appears when the interaction has a follow-up date and no
 * `task_id` yet; the action re-checks both, so a second click (or a second
 * browser tab) cannot create a second task for the same follow-up.
 */
export function FollowUpTaskButton({
  interactionId,
  taskId,
  dueDate,
  canLog,
}: {
  interactionId: string;
  taskId: string | null;
  /** ISO date the follow-up is due, shown on the button so the choice is honest. */
  dueDate: string | null;
  canLog: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  if (taskId) {
    return (
      <Link
        href="/manager/productivity/tasks"
        className="ob-touch-target text-xs text-[var(--ob-primary)] hover:underline"
      >
        Task recorded →
      </Link>
    );
  }
  if (!canLog || !dueDate) return null;

  async function create() {
    setBusy(true);
    const result = await createFollowUpTaskAction(interactionId);
    setBusy(false);
    setStatus(
      result.ok
        ? { kind: "ok", message: result.message ?? "Follow-up added to tasks." }
        : { kind: "error", message: result.message },
    );
    if (result.ok) router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        className="px-2 py-1 text-xs"
        loading={busy}
        onClick={create}
      >
        Make a task for {dueDate.slice(0, 10)}
      </Button>
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
