import type { WorkspaceSession } from "@/lib/workspace/session";

export function canEditWorkspaceFeatures(ws: WorkspaceSession): boolean {
  return ws.mode === "demo";
}

/**
 * Adds are allowed in every mode. The demo workspace stores them in the
 * per-browser mutable cookie store (capped per collection — see
 * `DEMO_LIMITS`), so the seeded CSV packs stay untouched while visitors can
 * ring up bills, save quotations and create records end to end.
 */
export function canAddWorkspaceRecords(): boolean {
  return true;
}
