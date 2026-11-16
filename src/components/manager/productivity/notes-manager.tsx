"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  deleteNoteAction,
  saveNoteAction,
  setNotePinnedAction,
  type NoteInput,
} from "@/services/productivity-actions";
import { NOTE_CATEGORIES, type Note, type NoteCategory, type NoteScope } from "@/types/business";

type Option = { id: string; name: string };
type ScopeFilter = "all" | NoteScope;
type CategoryFilter = "all" | NoteCategory;

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  general: "General",
  customer: "Customer",
  operations: "Operations",
  finance: "Finance",
  idea: "Idea",
  meeting: "Meeting",
};

const SCOPE_LABELS: Record<NoteScope, string> = {
  personal: "Personal",
  shared: "Shared",
};

export function NotesManager({
  notes,
  customers,
  staff,
  appointments,
  tasks,
  canEdit,
}: {
  notes: Note[];
  customers: Option[];
  staff: Option[];
  appointments: Option[];
  tasks: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NoteCategory>("general");
  const [scope, setScope] = useState<NoteScope>("personal");
  const [pinned, setPinned] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [taskId, setTaskId] = useState("");

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

  function startEdit(note: Note | null) {
    setEditing(note);
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setCategory(note?.category ?? "general");
    setScope(note?.scope ?? "personal");
    setPinned(note?.pinned ?? false);
    setCustomerId(note?.linkedCustomerId ?? "");
    setStaffId(note?.linkedStaffId ?? "");
    setAppointmentId(note?.linkedAppointmentId ?? "");
    setTaskId(note?.linkedTaskId ?? "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((p) => p.id === id)?.name ?? "Unknown" : null;

  const linkedLabels = (note: Note) =>
    [
      nameOf(customers, note.linkedCustomerId),
      nameOf(staff, note.linkedStaffId),
      nameOf(appointments, note.linkedAppointmentId),
      nameOf(tasks, note.linkedTaskId),
    ].filter((label): label is string => label !== null);

  const needle = query.trim().toLowerCase();
  const visible = notes
    .filter((note) => {
      if (scopeFilter !== "all" && note.scope !== scopeFilter) return false;
      if (categoryFilter !== "all" && note.category !== categoryFilter) return false;
      if (!needle) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(needle);
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updated_at.localeCompare(a.updated_at),
    );

  const categoryChips: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...NOTE_CATEGORIES.map((value) => ({ key: value, label: CATEGORY_LABELS[value] })),
  ];

  const form: NoteInput = {
    title,
    body,
    category,
    scope,
    pinned,
    customerId,
    staffId,
    appointmentId,
    taskId,
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit note" : "New note"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveNoteAction(editing?.id ?? null, form));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Title</span>
            <input className="ob-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Note</span>
            <textarea className="ob-input mt-1 min-h-28 w-full" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={5} disabled={!canEdit || pending} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Category</span>
              <select className="ob-input mt-1 w-full" value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)} disabled={!canEdit || pending}>
                {NOTE_CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Visible to</span>
              <select className="ob-input mt-1 w-full" value={scope} onChange={(e) => setScope(e.target.value as NoteScope)} disabled={!canEdit || pending}>
                <option value="personal">{SCOPE_LABELS.personal}</option>
                <option value="shared">{SCOPE_LABELS.shared}</option>
              </select>
            </label>
          </div>
          <label className="ob-touch-target flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} disabled={!canEdit || pending} />
            Pin to the top
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
              <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
                <option value="">None</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Staff member (optional)</span>
              <select className="ob-input mt-1 w-full" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!canEdit || pending}>
                <option value="">None</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Appointment (optional)</span>
              <select className="ob-input mt-1 w-full" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} disabled={!canEdit || pending}>
                <option value="">None</option>
                {appointments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Task (optional)</span>
              <select className="ob-input mt-1 w-full" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!canEdit || pending}>
                <option value="">None</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add note"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="ob-input w-full max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
          />
          <SegmentedControl
            value={scopeFilter}
            onChange={setScopeFilter}
            label="Note visibility"
            options={[
              { id: "all", label: "All" },
              { id: "personal", label: SCOPE_LABELS.personal },
              { id: "shared", label: SCOPE_LABELS.shared },
            ]}
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {categoryChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={categoryFilter === chip.key}
              className={`ob-touch-target rounded-full border px-3 text-sm ${categoryFilter === chip.key ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white" : "border-[var(--ob-border)]"}`}
              onClick={() => setCategoryFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {visible.length === 0 ? (
            <Card className="p-4 text-sm text-[var(--ob-text-muted)]">No notes match this filter.</Card>
          ) : visible.map((note) => {
            const links = linkedLabels(note);
            return (
              <Card key={note.id} className={`p-4 ${note.pinned ? "border-[var(--ob-primary)]!" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {note.title}
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{CATEGORY_LABELS[note.category]}</span>
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{SCOPE_LABELS[note.scope]}</span>
                      {note.pinned ? (
                        <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-primary)]">Pinned</span>
                      ) : null}
                    </p>
                    {note.body ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-[var(--ob-text-muted)]">{note.body}</p>
                    ) : null}
                    {links.length > 0 ? (
                      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">Linked to {links.join(" · ")}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                        disabled={pending}
                        onClick={() => run(() => setNotePinnedAction(note.id, !note.pinned))}
                      >
                        {note.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startEdit(note)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteNoteAction(note.id))}>Delete</button>
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
