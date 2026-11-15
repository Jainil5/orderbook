import type { CaptureMode } from "@/lib/workspace/constants";

/**
 * `projectOnly` marks the enquiry pipeline, which only exists for brands that
 * capture quotes against a site (`capture: "project"`). Every entry carries the
 * key so it stays readable off the union without narrowing.
 */
export const MANAGER_MODULES = [
  { key: "staff", label: "Staff", href: "/manager/staff", projectOnly: false },
  {
    key: "leads",
    label: "Leads Pipeline",
    href: "/manager/leads",
    projectOnly: true,
  },
  { key: "services", label: "Services", href: "/manager/services", projectOnly: false },
  {
    key: "appointments",
    label: "Meetings & Appointments",
    href: "/manager/appointments",
    projectOnly: false,
  },
  { key: "visits", label: "Visits & Field Ops", href: "/manager/visits", projectOnly: false },
  { key: "schedules", label: "Schedules", href: "/manager/schedules", projectOnly: false },
  { key: "tasks", label: "Tasks & Activities", href: "/manager/tasks", projectOnly: false },
] as const;

export type ManagerModule = (typeof MANAGER_MODULES)[number];
export type ManagerModuleKey = ManagerModule["key"];

export function isManagerModuleKey(value: string): value is ManagerModuleKey {
  return MANAGER_MODULES.some((m) => m.key === value);
}

export function visibleManagerModules(
  hidden: readonly string[],
  capture: CaptureMode = "counter",
): ManagerModule[] {
  return MANAGER_MODULES.filter(
    (m) => !hidden.includes(m.key) && (!m.projectOnly || capture === "project"),
  );
}

export function parseHiddenManagerModules(raw: unknown): ManagerModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ManagerModuleKey => typeof v === "string" && isManagerModuleKey(v),
  );
}
