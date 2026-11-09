import type { Task, TaskPriority, TaskStatus } from "@/types/operations";
import { dueAtMs } from "./time";

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export type TaskInput = {
  title: string;
  description?: string;
  assigneeStaffId?: string;
  customerId?: string;
  priority: string;
  dueAt?: string;
};

export function validateTaskInput(
  input: TaskInput,
  known: { staffIds: string[]; customerIds: string[] },
):
  | { ok: true; value: { title: string; description: string; assigneeStaffId: string | null; customerId: string | null; priority: TaskPriority; dueAt: string | null } }
  | { ok: false; message: string } {
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false, message: "Title is required." };
  if (!TASK_PRIORITIES.includes(input.priority as TaskPriority)) {
    return { ok: false, message: "Pick a valid priority." };
  }
  const assigneeStaffId = input.assigneeStaffId?.trim() || null;
  if (assigneeStaffId && !known.staffIds.includes(assigneeStaffId)) {
    return { ok: false, message: "Pick a valid assignee." };
  }
  const customerId = input.customerId?.trim() || null;
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a valid customer." };
  }
  let dueAt: string | null = null;
  if (input.dueAt) {
    const t = new Date(input.dueAt);
    if (Number.isNaN(t.getTime())) return { ok: false, message: "Enter a valid due date." };
    dueAt = t.toISOString();
  }
  return {
    ok: true,
    value: {
      title,
      description: (input.description ?? "").trim().slice(0, 500),
      assigneeStaffId,
      customerId,
      priority: input.priority as TaskPriority,
      dueAt,
    },
  };
}

export function isTaskOverdue(task: Task, now: Date): boolean {
  if (task.status === "done" || task.dueAt === null) return false;
  return dueAtMs(task.dueAt) < now.getTime();
}
