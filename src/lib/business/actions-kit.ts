import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { appendAudit } from "@/lib/csv/records";
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * Shared server-side plumbing for the Manager business collections: the same
 * brand guard, audit trail and revalidation the operations actions already
 * use, so each feature area only writes its own validation and mutations.
 */

export type BusinessGuard =
  | { ok: true; code: DemoBrandCode; brandId: string }
  | { ok: false; message: string };

const LIVE_UNAVAILABLE =
  "This area is not connected to live workspaces yet — open it in a demo workspace.";

export async function guardBusinessOps(): Promise<BusinessGuard> {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false, message: "Not allowed." };
    }
    return { ok: false, message: LIVE_UNAVAILABLE };
  }

  const { readDemoSessionBrandOrDefault } = await import(
    "@/lib/workspace/demo-session"
  );
  const code = await readDemoSessionBrandOrDefault();
  return { ok: true, code, brandId: getDemoBrandPack(code).brand.id };
}

/**
 * Append to `audit_log.csv`. Stays `async` although the store write is
 * synchronous, because every caller is a server action that awaits its steps.
 * The cookie bucket capped the trail at 200 entries; the file keeps them all
 * and `listAudit` returns newest first.
 */
export async function auditBusinessOps(
  guard: { code: DemoBrandCode; brandId: string },
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): Promise<void> {
  appendAudit(guard.brandId, {
    actor_email: null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail.slice(0, 300),
  });
}

/** Refresh the screen that changed, its manager overview, and `/manager`. */
export function revalidateBusiness(managerPath: string, sectionPath: string) {
  revalidatePath("/manager");
  revalidatePath(managerPath);
  revalidatePath(sectionPath);
}
