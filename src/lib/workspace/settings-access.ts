import type { WorkspaceSession } from "@/lib/workspace/session";

export function canEditWorkspaceFeatures(ws: WorkspaceSession): boolean {
  if (ws.mode === "demo") return true;
  const role = ws.member.role;
  return role === "owner" || role === "admin" || role === "manager";
}
