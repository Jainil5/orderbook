import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { appendDemoAudit } from "@/lib/demo/mutable-store";
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

  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ??
    "BR-1";
  return { ok: true, code, brandId: getDemoBrandPack(code).brand.id };
}

export async function auditBusinessOps(
  guard: { code: DemoBrandCode; brandId: string },
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): Promise<void> {
  await appendDemoAudit(guard.code, {
    brand_id: guard.brandId,
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
