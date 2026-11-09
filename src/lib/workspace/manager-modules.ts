export const MANAGER_MODULES = [
  { key: "staff", label: "Staff", href: "/manager/staff" },
  { key: "services", label: "Services", href: "/manager/services" },
  { key: "appointments", label: "Meetings & Appointments", href: "/manager/appointments" },
  { key: "visits", label: "Visits & Field Ops", href: "/manager/visits" },
  { key: "schedules", label: "Schedules", href: "/manager/schedules" },
  { key: "tasks", label: "Tasks & Activities", href: "/manager/tasks" },
] as const;

export type ManagerModule = (typeof MANAGER_MODULES)[number];
export type ManagerModuleKey = ManagerModule["key"];

export function isManagerModuleKey(value: string): value is ManagerModuleKey {
  return MANAGER_MODULES.some((m) => m.key === value);
}

export function visibleManagerModules(hidden: readonly string[]): ManagerModule[] {
  return MANAGER_MODULES.filter((m) => !hidden.includes(m.key));
}

export function parseHiddenManagerModules(raw: unknown): ManagerModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ManagerModuleKey => typeof v === "string" && isManagerModuleKey(v),
  );
}
