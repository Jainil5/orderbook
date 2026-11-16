import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { listDemoStaff } from "@/lib/demo/staff-data";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * Small validation primitives shared by the Manager feature areas. Every
 * server action validates its input here before touching the demo store, and
 * foreign keys are checked against ids that actually exist for the brand.
 */

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

export function text(
  value: unknown,
  field: string,
  max = 200,
  required = true,
): Validated<string> {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return required ? fail(`${field} is required.`) : { ok: true, value: "" };
  }
  return { ok: true, value: raw.slice(0, max) };
}

export function money(value: unknown, field = "Amount"): Validated<number> {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return fail(`Enter a valid ${field.toLowerCase()}.`);
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function quantity(value: unknown, field = "Quantity"): Validated<number> {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return fail(`Enter a valid ${field.toLowerCase()}.`);
  return { ok: true, value: n };
}

export function optionalQuantity(value: unknown, field = "Quantity"): Validated<number | null> {
  const raw = typeof value === "number" ? value : String(value ?? "").trim();
  if (raw === "" || raw === null) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return fail(`Enter a valid ${field.toLowerCase()}.`);
  return { ok: true, value: Math.max(0, n) };
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): Validated<T> {
  const raw = typeof value === "string" ? value : "";
  if (!allowed.includes(raw as T)) return fail(`Pick a valid ${field.toLowerCase()}.`);
  return { ok: true, value: raw as T };
}

/** `YYYY-MM-DD` calendar day. */
export function day(value: unknown, field: string, required = true): Validated<string> {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return required ? fail(`${field} is required.`) : { ok: true, value: "" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    return fail(`Enter a valid ${field.toLowerCase()}.`);
  }
  return { ok: true, value: raw };
}

/** ISO timestamp from a datetime input. */
export function instant(value: unknown, field: string, required = true): Validated<string | null> {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return required ? fail(`${field} is required.`) : { ok: true, value: null };
  }
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return fail(`Enter a valid ${field.toLowerCase()}.`);
  return { ok: true, value: t.toISOString() };
}

export function flag(value: unknown): boolean {
  return value === true || value === "true";
}

/** Id must belong to the brand's list, or be empty when optional. */
export function refId(
  value: unknown,
  known: readonly string[],
  field: string,
  required = false,
): Validated<string | null> {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return required ? fail(`${field} is required.`) : { ok: true, value: null };
  }
  if (!known.includes(raw)) return fail(`Pick a valid ${field.toLowerCase()}.`);
  return { ok: true, value: raw };
}

export type KnownRefs = {
  customerIds: string[];
  staffIds: string[];
  productIds: string[];
  serviceIds: string[];
  supplierIds: string[];
};

/** Everything a Manager action may reference for this brand. */
export async function knownRefs(code: DemoBrandCode): Promise<KnownRefs> {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const staff = await listDemoStaff(code);
  return {
    customerIds: mergeDemoCustomers(pack.customers, bucket).map((c) => c.id),
    staffIds: staff.map((s) => s.id),
    productIds: pack.products.map((p) => p.id),
    serviceIds: pack.services.map((s) => s.id),
    supplierIds: bucket.suppliers.map((s) => s.id),
  };
}
