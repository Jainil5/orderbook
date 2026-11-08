"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { isTaskOverdue, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/manager/tasks";
import { deleteTaskAction, saveTaskAction, setTaskStatusAction } from "@/services/manager-ops-actions";
import type { Task, TaskStatus } from "@/types/operations";

type Option = { id: string; name: string };
type Filter = "all" | TaskStatus | "overdue";

const PRIORITY_STYLES: Record<Task["priority"], string> = {
  high: "bg-[#fbeaec] text-[#be123c]",
  medium: "bg-[#fdf1e3] text-[#b45309]",
  low: "bg-[var(--ob-surface-muted)] text-[var(--ob-text-muted)]",
};

// datetime-local inputs need LOCAL time; stored timestamps are ISO/UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TasksManager({
  tasks,
  staff,
  customers,
  canEdit,
}: {
  tasks: Task[];
  staff: Option[];
  customers: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(task: Task | null) {
    setEditing(task);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssignee(task?.assigneeStaffId ?? "");
    setCustomerId(task?.customerId ?? "");
    setPriority(task?.priority ?? "medium");
    setDueAt(task?.dueAt ? toLocalInput(task.dueAt) : "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((p) => p.id === id)?.name ?? "Unknown" : null;
  const now = new Date();
  const visible = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isTaskOverdue(t, now);
    return t.status === filter;
  });
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In progress" },
    { key: "done", label: "Done" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit task" : "New task"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveTaskAction(editing?.id ?? null, {
                title,
                description,
                assigneeStaffId: assignee || undefined,
                customerId: customerId || undefined,
                priority,
                dueAt: dueAt || undefined,
              }),
            );
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Title</span>
            <input className="ob-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Description (optional)</span>
            <input className="ob-input mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Assignee (optional)</span>
            <select className="ob-input mt-1 w-full" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit || pending}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Priority</span>
              <select className="ob-input mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canEdit || pending}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Due (optional)</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!canEdit || pending} />
            </label>
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add task"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ob-touch-target rounded-full border px-3 text-sm ${filter === f.key ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white" : "border-[var(--ob-border)]"}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {visible.length === 0 ? (
            <Card className="p-4 text-sm text-[var(--ob-text-muted)]">No tasks match this filter.</Card>
          ) : visible.map((t) => {
            const overdue = isTaskOverdue(t, now);
            return (
              <Card key={t.id} className={`p-4 ${overdue ? "border border-[#be123c]!" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title}
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${PRIORITY_STYLES[t.priority]}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{TASK_STATUS_LABELS[t.status]}</span>
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {nameOf(staff, t.assigneeStaffId) ?? "Unassigned"}
                      {nameOf(customers, t.customerId) ? ` · ${nameOf(customers, t.customerId)}` : ""}
                      {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleString()}` : ""}
                      {overdue ? " · OVERDUE" : ""}
                    </p>
                    {t.description ? <p className="text-sm text-[var(--ob-text-muted)]">{t.description}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {t.status === "open" ? (
                        <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "in_progress"))}>Start</button>
                      ) : null}
                      {t.status !== "done" ? (
                        <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "done"))}>Done</button>
                      ) : (
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "open"))}>Reopen</button>
                      )}
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startEdit(t)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteTaskAction(t.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
