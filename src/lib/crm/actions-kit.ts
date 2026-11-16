import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import {
  canLogCrmActivity,
  canManageCrm,
} from "@/lib/security/authorization";
import { appendAudit } from "@/lib/csv/records";
import type { BrandRole } from "@/types/database";
import type { Validated } from "@/lib/business/validate";
import { getCrmRepository, newCrmId, type CrmRepository } from "./repository";
import type { CrmWorkspace } from "./loader";

/**
 * Shared plumbing for CRM actions: the same guard → validate →
 * write → audit → revalidate shape the Manager actions already use, with the
 * permission check in one place so no action can forget it.
 */

/**
 * The validation primitives every CRM action uses, re-exported so a CRM action
 * file opens with one import block (`@/lib/crm/actions-kit`) instead of
 * reaching into `@/lib/business/validate` for each function. These are the
 * plain validators; `field`, `requiredField` and `optionalDate` below are the
 * same rules for `FormData`.
 */
export {
  day,
  flag,
  instant,
  money,
  oneOf,
  refId,
  text,
  type Validated,
} from "@/lib/business/validate";

export const CRM_PATHS = [
  "/customers",
  "/customers/directory",
  "/customers/leads",
  "/customers/interactions",
  "/customers/reviews",
  "/customers/segments",
  "/customers/campaigns",
  "/customers/loyalty",
] as const;

export type CrmScope = "log" | "manage";

export type CrmPermissions = {
  role: BrandRole;
  canLog: boolean;
  canManage: boolean;
};

export function crmPermissionsFor(role: BrandRole): CrmPermissions {
  return {
    role,
    canLog: canLogCrmActivity(role),
    canManage: canManageCrm(role),
  };
}

export type CrmGuard =
  | ({ ok: true } & CrmPermissions & {
      repo: CrmRepository;
      brandId: string;
      brandCode: string;
    })
  | { ok: false; message: string };

/**
 * `log` = record activity on a customer/lead. `manage` = anything that
 * changes marketing, segmentation, loyalty rules or deletes records.
 */
export async function guardCrm(scope: CrmScope = "log"): Promise<CrmGuard> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false, message: "Not allowed." };
  const permissions = crmPermissionsFor(ws.role);
  const allowed = scope === "manage" ? permissions.canManage : permissions.canLog;
  if (!allowed) {
    return {
      ok: false,
      message:
        scope === "manage"
          ? "Only owners, admins and managers can change CRM settings, segments, campaigns or loyalty rules."
          : "Your role can read the CRM but not record activity.",
    };
  }
  const repo = await getCrmRepository();
  if (!repo) return { ok: false, message: "No workspace is connected." };
  return {
    ok: true,
    ...permissions,
    repo,
    brandId: repo.brandId,
    brandCode: repo.brandCode,
  };
}

export type CrmActionState =
  | { ok: true; message?: string }
  | { ok: false; message: string };

/**
 * A record id that arrived from the client must be one this workspace already
 * owns. `CrmRepository.save` refuses another brand's id by *throwing*, and an
 * action's only failure channel is `{ ok: false, message }` — so the id is
 * checked here, before any write is attempted. A blank id means "new", which is
 * the only way this mints one.
 */
export function crmRecordId(
  supplied: unknown,
  owned: string[],
  label: string,
): Validated<string> {
  if (typeof supplied !== "string" || supplied.trim() === "")
    return { ok: true, value: newCrmId() };
  const id = supplied.trim();
  if (!owned.includes(id))
    return {
      ok: false,
      message: `That ${label.toLowerCase()} does not belong to this workspace. Refresh the list and try again.`,
    };
  return { ok: true, value: id };
}

/** Ids the brand actually owns — validated server-side, never from the client. */
export type CrmRefs = {
  customerIds: string[];
  leadIds: string[];
  staffIds: string[];
  segmentIds: string[];
  campaignIds: string[];
  reviewIds: string[];
  complaintIds: string[];
  interactionIds: string[];
  orderIds: string[];
  offerIds: string[];
};

export function crmRefs(crm: CrmWorkspace): CrmRefs {
  return {
    customerIds: crm.customers.map((c) => c.id),
    leadIds: crm.leads.map((l) => l.id),
    staffIds: crm.staff.map((s) => s.id),
    segmentIds: crm.segments.map((s) => s.id),
    campaignIds: crm.campaigns.map((c) => c.id),
    reviewIds: crm.reviews.map((r) => r.id),
    complaintIds: crm.complaints.map((c) => c.id),
    interactionIds: crm.interactions.map((i) => i.id),
    orderIds: crm.orders.map((o) => o.id),
    offerIds: crm.offers.map((o) => o.id),
  };
}

/**
 * Audit every CRM write the same way Manager writes are audited.
 *
 * This used to be demo-only, because the only audit store the app had was a
 * demo cookie a live workspace could not write to. `audit_log.csv` is keyed by
 * `brand_id` like every other table, so a live brand's rows land in the same
 * trail and nothing is skipped.
 */
export async function auditCrm(
  guard: { brandId: string },
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

/** Refresh the CRM screens a write can affect. */
export function revalidateCrm(...extra: string[]): void {
  const paths = new Set<string>([...CRM_PATHS, ...extra]);
  for (const path of paths) revalidatePath(path);
  // Layout scope also invalidates every /customers/[customerId] page.
  revalidatePath("/customers", "layout");
}

/**
 * One trimmed form field, or `undefined` when the name is absent or blank.
 * `undefined` means "this form does not manage it" — the same rule the
 * customer merge uses, so a small inline form cannot clear a column.
 */
export function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** A field that must be present, as a validation result rather than a throw. */
export function requiredField(form: FormData, name: string, label: string) {
  const value = field(form, name);
  return value === undefined
    ? { ok: false as const, message: `${label} is required.` }
    : { ok: true as const, value };
}

/**
 * CRM screens post plain HTML forms (no client-side fetch), so the outcome
 * travels back in the URL: `?notice=` on success, `?error=` on failure.
 * Nothing is faked — the notice names what was actually recorded.
 */
export function crmReturnTo(
  path: string,
  outcome: { notice?: string; error?: string; query?: Record<string, string | undefined> },
): never {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(outcome.query ?? {})) {
    if (value) params.set(key, value);
  }
  if (outcome.notice) params.set("notice", outcome.notice);
  if (outcome.error) params.set("error", outcome.error.slice(0, 200));
  const qs = params.toString();
  redirect(qs ? `${path}?${qs}` : path);
}

/** A single date/datetime input → ISO, or null when blank. */
export function optionalDate(value: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: true, value: null };
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return { ok: false, message: "Enter a valid date." };
  return { ok: true, value: t.toISOString() };
}

/** CSV for the export buttons, same shape as the other exports. */
export function crmCsv(
  filename: string,
  rows: Record<string, unknown>[],
): { ok: true; csv: string; filename: string } {
  const columns = rows.length
    ? Object.keys(rows[0])
    : [];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(","));
  return { ok: true, csv: lines.join("\n"), filename };
}
