import type { WorkspaceSession } from "@/lib/workspace/session";

export function canEditWorkspaceFeatures(ws: WorkspaceSession): boolean {
  return ws.mode === "demo";
}

/**
 * The demo workspace is a showcase of a fixed dataset, so nothing can be added:
 * every "Add / New" control is hidden and the matching server actions reject.
 * Editing and status changes still work — they only reshape rows that already exist.
 *
 * The CRM is the documented exception. A fixed dataset cannot show what a CRM
 * looks like after a week of use, so interactions, reviews, complaints,
 * segments, campaigns, loyalty entries and enquiry conversions are creatable —
 * and they land in the per-browser mutable store, never in the seeded CSVs the
 * showcase stats are asserted against.
 */
export function canAddWorkspaceRecords(ws: WorkspaceSession): boolean {
  return ws.mode !== "demo";
}
