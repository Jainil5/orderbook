import { isTaskOverdue } from "@/lib/manager/tasks";
import type { Task, TaskPriority } from "@/types/operations";

/**
 * Task categories, recurrence and reminders have no columns on `Task`
 * (`types/operations.ts`) yet, so they are derived here from the fields that
 * do exist — title, description, priority and due date. Nothing is persisted:
 * the tasks screen still saves exactly what `Task` can hold.
 */

export const TASK_CATEGORIES = [
  "follow_up",
  "restock",
  "maintenance",
  "delivery",
  "admin",
  "general",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  follow_up: "Follow-ups",
  restock: "Stock & supplies",
  maintenance: "Cleaning & maintenance",
  delivery: "Delivery & installs",
  admin: "Admin & compliance",
  general: "General",
};

const CATEGORY_KEYWORDS: [TaskCategory, string[]][] = [
  ["follow_up", ["follow up", "follow-up", "chase", "confirm", "check back", "call back", "revisit", "reply"]],
  ["restock", ["restock", "reorder", "re-order", "order more", "supplies", "stock"]],
  ["maintenance", ["clean", "descale", "repair", "service", "maintenance"]],
  ["delivery", ["deliver", "install", "site visit", "measurement", "fitting"]],
  ["admin", ["invoice", "payroll", "gst", "licence", "insurance", "audit", "bookkeep"]],
];

export const TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;

export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none: "One-off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const RECURRENCE_KEYWORDS: [TaskRecurrence, string[]][] = [
  ["daily", ["daily", "every day", "each day", "every morning", "each morning"]],
  ["weekly", ["weekly", "every week", "each week", "every monday", "every friday", "every saturday", "every sunday"]],
  ["monthly", ["monthly", "every month", "each month"]],
];

function haystack(task: Task): string {
  return `${task.title} ${task.description}`.toLowerCase();
}

export function taskCategory(task: Task): TaskCategory {
  const text = haystack(task);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return "general";
}

export function taskRecurrence(task: Task): TaskRecurrence {
  const text = haystack(task);
  for (const [recurrence, keywords] of RECURRENCE_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return recurrence;
  }
  return "none";
}

/** How long before the due time the reminder should fire, by priority. */
const REMINDER_LEAD_MINUTES: Record<TaskPriority, number> = {
  high: 60,
  medium: 240,
  low: 1_440,
};

export type TaskMeta = {
  category: TaskCategory;
  recurrence: TaskRecurrence;
  /** Null when the task has no due time or is already done. */
  reminderAt: string | null;
};

export function taskMeta(task: Task): TaskMeta {
  const reminderAt =
    task.status === "done" || !task.dueAt
      ? null
      : new Date(
          Date.parse(task.dueAt) - REMINDER_LEAD_MINUTES[task.priority] * 60_000,
        ).toISOString();
  return {
    category: taskCategory(task),
    recurrence: taskRecurrence(task),
    reminderAt,
  };
}

/** Soonest due first, tasks with no due date last, then by title. */
function byDueThenTitle(a: Task, b: Task): number {
  if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title);
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title);
}

const isOpen = (task: Task) => task.status !== "done";

/**
 * Follow-ups waiting on someone else: open follow-up tasks plus any open task
 * that has slipped past its due date.
 */
export function followUpTasks(tasks: Task[], now: Date): Task[] {
  return tasks
    .filter((t) => isOpen(t) && (taskCategory(t) === "follow_up" || isTaskOverdue(t, now)))
    .sort(byDueThenTitle);
}

export function reminderDueTasks(tasks: Task[], now: Date): Task[] {
  const stamp = now.toISOString();
  return tasks
    .filter((t) => {
      const { reminderAt } = taskMeta(t);
      return reminderAt !== null && reminderAt <= stamp;
    })
    .sort(byDueThenTitle);
}

export function recurringTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => isOpen(t) && taskRecurrence(t) !== "none");
}

/** Open tasks grouped for the category summary, in `TASK_CATEGORIES` order. */
export function openTasksByCategory(tasks: Task[]): {
  category: TaskCategory;
  tasks: Task[];
}[] {
  return TASK_CATEGORIES.map((category) => ({
    category,
    tasks: tasks.filter((task) => isOpen(task) && taskCategory(task) === category),
  })).filter((group) => group.tasks.length > 0);
}
