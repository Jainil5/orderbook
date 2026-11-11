import type { WorkspaceSession } from "@/lib/workspace/session";

export function canEditWorkspaceFeatures(ws: WorkspaceSession): boolean {
  return ws.mode === "demo";
}
