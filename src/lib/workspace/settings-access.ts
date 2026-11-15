import type { WorkspaceSession } from "@/lib/workspace/session";

export function canEditWorkspaceFeatures(ws: WorkspaceSession): boolean {
  return ws.mode === "demo";
}

/**
 * The demo workspace is a showcase of a fixed dataset, so nothing can be added:
 * every "Add / New" control is hidden and the matching server actions reject.
 * Editing and status changes still work — they only reshape rows that already exist.
 */
export function canAddWorkspaceRecords(ws: WorkspaceSession): boolean {
  return ws.mode !== "demo";
}
