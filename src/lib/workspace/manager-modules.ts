import {
  ALL_MANAGER_SECTIONS,
  isKnownSectionKey,
} from "@/lib/workspace/managers";

/**
 * Module-visibility keys. Every key is a Manager section key from the registry
 * in `lib/workspace/managers.ts`; the pairing is asserted in
 * `manager-modules.test.ts` so the two lists cannot drift apart.
 *
 * Keys that existed in the previous flat module list (tasks, services,
 * appointments, visits, schedules, staff) keep their names so saved workspace
 * preferences stay valid.
 */
export const MANAGER_SECTION_KEYS = [
  "tasks",
  "notes",
  "calendar",
  "appointments",
  "visits",
  "integrations",
  "staff",
  "schedules",
  "attendance",
  "performance",
  "permissions",
  "catalogue",
  "services",
  "inventory",
  "procurement",
  "intelligence",
  "payments",
  "receivables",
  "refunds",
  "expenses",
  "cash",
] as const;

export type ManagerModuleKey = (typeof MANAGER_SECTION_KEYS)[number];

export function isManagerModuleKey(value: string): value is ManagerModuleKey {
  return isKnownSectionKey(value);
}

/** Narrows a registry key (typed as `string`) to a toggle key, or null. */
export function asSectionKey(value: string): ManagerModuleKey | null {
  return isManagerModuleKey(value) ? value : null;
}

export function parseHiddenManagerModules(raw: unknown): ManagerModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ManagerModuleKey => typeof v === "string" && isManagerModuleKey(v),
  );
}

/** Flat list of every visible section (used by search and the command palette). */
export function visibleManagerSections(
  hidden: readonly string[],
): { key: string; label: string; href: string }[] {
  return ALL_MANAGER_SECTIONS.filter((s) => !hidden.includes(s.key)).map(
    (s) => ({ key: s.key, label: s.navLabel, href: s.href }),
  );
}
