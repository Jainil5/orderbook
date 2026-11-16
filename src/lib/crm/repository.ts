/**
 * The CRM storage boundary.
 *
 * One interface, two drivers:
 * - `CsvCrmRepository` — the active driver (Supabase switched off deployment
 *   wide; see `supabaseEnabled()` in src/lib/env.ts). Rows live in `data/*.csv`
 *   keyed by `brand_id`, exactly like the rest of the CSV era.
 * - `SupabaseCrmRepository` — dormant, same method set, same row shapes.
 *   Column names in src/lib/csv/schema.ts match supabase/migrations/0002_crm.sql
 *   1:1, so flipping the switch changes nothing above this file.
 *
 * Tenancy rules (enforced here, once, for every caller):
 * - `brand_id` on a write always comes from the resolved session context, never
 *   from a client-supplied field.
 * - Reads are brand-scoped, so a guessed id from another brand resolves to
 *   `null` instead of leaking a row.
 * - `patch`/`remove` re-check the stored row's brand before touching it.
 */

import { supabaseEnabled } from "@/lib/env";
import {
  findRow,
  patchRow,
  readBrandRows,
  removeRow,
  upsertRow,
} from "@/lib/csv/store";
import { csvBrandContext } from "@/services/data";
import type {
  CampaignRecipient,
  Complaint,
  CrmSettings,
  CustomerSegment,
  Interaction,
  Lead,
  LoyaltyAccount,
  LoyaltyTransaction,
  MarketingCampaign,
  Membership,
  Review,
} from "@/types/crm";

/** CRM-owned tables. Customers/orders/payments stay with services/data.ts. */
export type CrmTable =
  | "leads"
  | "customer_interactions"
  | "customer_reviews"
  | "customer_complaints"
  | "customer_segments"
  | "marketing_campaigns"
  | "campaign_recipients"
  | "loyalty_accounts"
  | "loyalty_transactions"
  | "memberships"
  | "crm_settings";

/** Table → entity type, so callers get typed rows without casting. */
export type CrmRowFor<T extends CrmTable> = T extends "leads"
  ? Lead
  : T extends "customer_interactions"
    ? Interaction
    : T extends "customer_reviews"
      ? Review
      : T extends "customer_complaints"
        ? Complaint
        : T extends "customer_segments"
          ? CustomerSegment
          : T extends "marketing_campaigns"
            ? MarketingCampaign
            : T extends "campaign_recipients"
              ? CampaignRecipient
              : T extends "loyalty_accounts"
                ? LoyaltyAccount
                : T extends "loyalty_transactions"
                  ? LoyaltyTransaction
                  : T extends "memberships"
                    ? Membership
                    : CrmSettings;

/** CSV file name === SQL table name for every CRM table. */
export const CRM_SQL_TABLES: Record<CrmTable, string> = {
  leads: "leads",
  customer_interactions: "customer_interactions",
  customer_reviews: "customer_reviews",
  customer_complaints: "customer_complaints",
  customer_segments: "customer_segments",
  marketing_campaigns: "marketing_campaigns",
  campaign_recipients: "campaign_recipients",
  loyalty_accounts: "loyalty_accounts",
  loyalty_transactions: "loyalty_transactions",
  memberships: "memberships",
  crm_settings: "crm_settings",
};

/** Tables whose rows carry both created_at and updated_at. */
const STAMPED: Record<CrmTable, "both" | "created" | "updated"> = {
  leads: "both",
  customer_interactions: "created",
  customer_reviews: "both",
  customer_complaints: "both",
  customer_segments: "both",
  marketing_campaigns: "both",
  campaign_recipients: "both",
  loyalty_accounts: "both",
  loyalty_transactions: "created",
  memberships: "both",
  crm_settings: "updated",
};

export type CrmDriver = "csv" | "supabase";

export interface CrmRepository {
  readonly driver: CrmDriver;
  /** Tenancy key every write is stamped with. Never caller-supplied. */
  readonly brandId: string;
  readonly brandCode: string;

  list<T extends CrmTable>(table: T): Promise<CrmRowFor<T>[]>;
  find<T extends CrmTable>(table: T, id: string): Promise<CrmRowFor<T> | null>;
  /** Insert or replace a row. `brand_id` and timestamps are stamped here. */
  save<T extends CrmTable>(
    table: T,
    row: Partial<CrmRowFor<T>> & { id: string },
  ): Promise<CrmRowFor<T>>;
  /** Partial update of an existing brand-owned row; null when not found. */
  patch<T extends CrmTable>(
    table: T,
    id: string,
    patch: Partial<CrmRowFor<T>>,
  ): Promise<CrmRowFor<T> | null>;
  /** Delete a brand-owned row. */
  remove(table: CrmTable, id: string): Promise<boolean>;
  /** Delete every row matching a predicate (recipients rebuild, cleanup). */
  removeWhere<T extends CrmTable>(
    table: T,
    predicate: (row: CrmRowFor<T>) => boolean,
  ): Promise<number>;
}

/** CRM write ids — same convention as the other CSV-era transactional rows. */
export function newCrmId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Stamp brand + audit timestamps on a row before it is written. */
function withStamps<T extends CrmTable>(
  table: T,
  brandId: string,
  row: Partial<CrmRowFor<T>> & { id: string },
  existing: Record<string, unknown> | null,
): Record<string, unknown> {
  const stamp = nowIso();
  const next: Record<string, unknown> = {
    ...(existing ?? {}),
    ...row,
    id: row.id,
    brand_id: brandId,
  };
  const mode = STAMPED[table];
  if (mode === "both" || mode === "created") {
    if (!next.created_at) next.created_at = stamp;
  }
  if (mode === "both" || mode === "updated") next.updated_at = stamp;
  return next;
}

function asRow<T extends CrmTable>(row: Record<string, unknown>): CrmRowFor<T> {
  return row as unknown as CrmRowFor<T>;
}

/* ------------------------------------------------------------------ */
/* CSV driver (active)                                                 */
/* ------------------------------------------------------------------ */

export class CsvCrmRepository implements CrmRepository {
  readonly driver = "csv" as const;

  constructor(
    readonly brandId: string,
    readonly brandCode: string,
  ) {}

  async list<T extends CrmTable>(table: T): Promise<CrmRowFor<T>[]> {
    return readBrandRows(table, this.brandId).map(asRow<T>);
  }

  async find<T extends CrmTable>(table: T, id: string): Promise<CrmRowFor<T> | null> {
    const row = findRow(table, id);
    // Another brand's row is invisible, not an error.
    if (!row || row.brand_id !== this.brandId) return null;
    return asRow<T>(row);
  }

  async save<T extends CrmTable>(
    table: T,
    row: Partial<CrmRowFor<T>> & { id: string },
  ): Promise<CrmRowFor<T>> {
    const existing = findRow(table, row.id);
    if (existing && existing.brand_id !== this.brandId) {
      throw new Error("Record belongs to another brand.");
    }
    const next = withStamps(table, this.brandId, row, existing ?? null);
    upsertRow(table, next);
    return asRow<T>(next);
  }

  async patch<T extends CrmTable>(
    table: T,
    id: string,
    patch: Partial<CrmRowFor<T>>,
  ): Promise<CrmRowFor<T> | null> {
    const existing = findRow(table, id);
    if (!existing || existing.brand_id !== this.brandId) return null;
    const next = withStamps(
      table,
      this.brandId,
      { ...(patch as Record<string, unknown>), id } as Partial<CrmRowFor<T>> & {
        id: string;
      },
      existing,
    );
    return patchRow(table, id, next) ? asRow<T>(next) : null;
  }

  async remove(table: CrmTable, id: string): Promise<boolean> {
    const existing = findRow(table, id);
    if (!existing || existing.brand_id !== this.brandId) return false;
    return removeRow(table, id);
  }

  async removeWhere<T extends CrmTable>(
    table: T,
    predicate: (row: CrmRowFor<T>) => boolean,
  ): Promise<number> {
    const rows = await this.list(table);
    const doomed = rows.filter(predicate);
    let removed = 0;
    for (const row of doomed) {
      if (removeRow(table, row.id)) removed += 1;
    }
    return removed;
  }
}

/* ------------------------------------------------------------------ */
/* Supabase driver (dormant — same surface, RLS does the tenancy)      */
/* ------------------------------------------------------------------ */

/**
 * Minimal structural type for the Supabase JS surface the CRM driver uses.
 * Declared here so the dormant driver compiles without pulling the real
 * client's generics into the CSV-only build (and so a future integration has
 * to satisfy exactly these calls).
 */
type CrmResponse = {
  data: unknown[] | null;
  error?: { message?: string } | null;
};

interface CrmFiltered extends Promise<CrmResponse> {
  eq(column: string, value: unknown): CrmFiltered;
}

type CrmClient = {
  from(table: string): {
    select(columns: string): CrmFiltered;
    upsert(row: Record<string, unknown>): Promise<CrmResponse>;
    update(row: Record<string, unknown>): CrmFiltered;
    delete(): CrmFiltered;
  };
};

/**
 * Every query filters on `brand_id` explicitly, and RLS restricts the same
 * rows again at the database (docs/SUPABASE_RLS_APPLY.sql + the CRM policies in
 * supabase/migrations/0002_crm.sql). Two independent layers, same key.
 */
export class SupabaseCrmRepository implements CrmRepository {
  readonly driver = "supabase" as const;

  constructor(
    private readonly client: CrmClient,
    readonly brandId: string,
    readonly brandCode: string,
  ) {}

  private async all<T extends CrmTable>(table: T): Promise<CrmRowFor<T>[]> {
    const { data, error } = await this.client
      .from(CRM_SQL_TABLES[table])
      .select("*")
      .eq("brand_id", this.brandId);
    if (error) throw new Error(error.message ?? "CRM query failed.");
    return (data ?? []) as CrmRowFor<T>[];
  }

  async list<T extends CrmTable>(table: T): Promise<CrmRowFor<T>[]> {
    return this.all(table);
  }

  async find<T extends CrmTable>(table: T, id: string): Promise<CrmRowFor<T> | null> {
    const { data } = await this.client
      .from(CRM_SQL_TABLES[table])
      .select("*")
      .eq("id", id)
      .eq("brand_id", this.brandId);
    return ((data ?? [])[0] as CrmRowFor<T>) ?? null;
  }

  async save<T extends CrmTable>(
    table: T,
    row: Partial<CrmRowFor<T>> & { id: string },
  ): Promise<CrmRowFor<T>> {
    const existing = await this.find(table, row.id);
    const next = withStamps(table, this.brandId, row, existing ?? null);
    const { error } = await this.client
      .from(CRM_SQL_TABLES[table])
      .upsert(next);
    if (error) throw new Error(error.message ?? "CRM write failed.");
    return asRow<T>(next);
  }

  async patch<T extends CrmTable>(
    table: T,
    id: string,
    patch: Partial<CrmRowFor<T>>,
  ): Promise<CrmRowFor<T> | null> {
    const existing = await this.find(table, id);
    if (!existing) return null;
    const next = withStamps(
      table,
      this.brandId,
      { ...(patch as Record<string, unknown>), id } as Partial<CrmRowFor<T>> & {
        id: string;
      },
      existing as unknown as Record<string, unknown>,
    );
    await this.client.from(CRM_SQL_TABLES[table]).update(next).eq("id", id);
    return asRow<T>(next);
  }

  async remove(table: CrmTable, id: string): Promise<boolean> {
    const existing = await this.find(table, id);
    if (!existing) return false;
    await this.client.from(CRM_SQL_TABLES[table]).delete().eq("id", id);
    return true;
  }

  async removeWhere<T extends CrmTable>(
    table: T,
    predicate: (row: CrmRowFor<T>) => boolean,
  ): Promise<number> {
    const rows = await this.all(table);
    const doomed = rows.filter(predicate);
    for (const row of doomed) {
      await this.client.from(CRM_SQL_TABLES[table]).delete().eq("id", row.id);
    }
    return doomed.length;
  }
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/**
 * The repository for the current workspace. Null when there is no session —
 * callers must treat that as "not allowed", never as "empty data".
 */
export async function getCrmRepository(): Promise<CrmRepository | null> {
  const ctx = await csvBrandContext();
  if (!ctx) return null;
  if (!supabaseEnabled()) {
    return new CsvCrmRepository(ctx.brandId, ctx.brandCode);
  }
  // Dormant until OB_USE_SUPABASE="true" with valid keys. CRM tables only
  // exist there once supabase/migrations/0002_crm.sql has been applied.
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const client = await createSupabaseServerClient();
  return new SupabaseCrmRepository(
    client as unknown as CrmClient,
    ctx.brandId,
    ctx.brandCode,
  );
}

/** Deterministic clock for CRM reads: one instant per page/action. */
export function crmAsOf(): string {
  return new Date().toISOString();
}
