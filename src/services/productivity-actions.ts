"use server";

import {
  auditBusinessOps,
  guardBusinessOps,
  revalidateBusiness,
} from "@/lib/business/actions-kit";
import { notesCollection } from "@/lib/business/registry";
import {
  flag,
  knownRefs,
  oneOf,
  refId,
  text,
} from "@/lib/business/validate";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { NOTE_CATEGORIES, type Note, type NoteScope } from "@/types/business";

/**
 * Server actions for Productivity notes. Everything runs through the shared
 * business guard, validators and audit trail, and revalidates the manager
 * overview plus the notes screen.
 */

const PRODUCTIVITY_PATH = "/manager/productivity";
const NOTES_PATH = "/manager/productivity/notes";

const NOTE_SCOPES: readonly NoteScope[] = ["personal", "shared"];

export type NoteInput = {
  title: string;
  body: string;
  category: string;
  scope: string;
  pinned: boolean | string;
  customerId: string;
  staffId: string;
  appointmentId: string;
  taskId: string;
};

type NoteRefs = {
  customerIds: string[];
  staffIds: string[];
  appointmentIds: string[];
  taskIds: string[];
};

async function noteRefs(code: DemoBrandCode): Promise<NoteRefs> {
  const [refs, ops] = await Promise.all([
    knownRefs(code),
    loadDemoOperations(code),
  ]);
  return {
    customerIds: refs.customerIds,
    staffIds: refs.staffIds,
    appointmentIds: ops.appointments.map((a) => a.id),
    taskIds: ops.tasks.map((t) => t.id),
  };
}

async function validateNote(input: NoteInput, code: DemoBrandCode) {
  const refs = await noteRefs(code);

  const title = text(input.title, "Title", 120);
  if (!title.ok) return title;
  const body = text(input.body, "Note", 4_000, false);
  if (!body.ok) return body;
  const category = oneOf(input.category, NOTE_CATEGORIES, "Category");
  if (!category.ok) return category;
  const scope = oneOf(input.scope, NOTE_SCOPES, "Scope");
  if (!scope.ok) return scope;
  const customerId = refId(input.customerId, refs.customerIds, "Customer");
  if (!customerId.ok) return customerId;
  const staffId = refId(input.staffId, refs.staffIds, "Staff member");
  if (!staffId.ok) return staffId;
  const appointmentId = refId(
    input.appointmentId,
    refs.appointmentIds,
    "Appointment",
  );
  if (!appointmentId.ok) return appointmentId;
  const taskId = refId(input.taskId, refs.taskIds, "Task");
  if (!taskId.ok) return taskId;

  return {
    ok: true as const,
    value: {
      title: title.value,
      body: body.value,
      category: category.value,
      scope: scope.value,
      pinned: flag(input.pinned),
      linkedCustomerId: customerId.value,
      linkedStaffId: staffId.value,
      linkedAppointmentId: appointmentId.value,
      linkedTaskId: taskId.value,
    },
  };
}

export async function saveNoteAction(id: string | null, input: NoteInput) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const parsed = await validateNote(input, guard.code);
  if (!parsed.ok) return parsed;

  const now = new Date().toISOString();
  if (id) {
    await notesCollection.patch(guard.code, id, {
      ...parsed.value,
      updated_at: now,
    });
    await auditBusinessOps(guard, "note.updated", "note", id, parsed.value.title);
  } else {
    const note: Note = {
      id: notesCollection.nextId(),
      brand_id: guard.brandId,
      ...parsed.value,
      created_at: now,
      updated_at: now,
    };
    await notesCollection.append(guard.code, note);
    await auditBusinessOps(guard, "note.created", "note", note.id, note.title);
  }
  revalidateBusiness(PRODUCTIVITY_PATH, NOTES_PATH);
  return { ok: true as const };
}

export async function setNotePinnedAction(id: string, pinned: boolean) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  await notesCollection.patch(guard.code, id, {
    pinned,
    updated_at: new Date().toISOString(),
  });
  await auditBusinessOps(
    guard,
    pinned ? "note.pinned" : "note.unpinned",
    "note",
    id,
    id,
  );
  revalidateBusiness(PRODUCTIVITY_PATH, NOTES_PATH);
  return { ok: true as const };
}

export async function deleteNoteAction(id: string) {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const note = (await notesCollection.load(guard.code)).find((n) => n.id === id);
  if (!note) return { ok: false as const, message: "Note not found." };
  await notesCollection.remove(guard.code, id);
  await auditBusinessOps(guard, "note.deleted", "note", id, note.title);
  revalidateBusiness(PRODUCTIVITY_PATH, NOTES_PATH);
  return { ok: true as const };
}
