import type { DemoMutableBucket } from "@/lib/demo/mutable-store";
import { mergeOpsEntities } from "@/lib/manager/ops-shared";
import type {
  Customer,
  Offer,
  Order,
  Payment,
  Product,
} from "@/types/database";

export function mergeDemoCustomers(
  base: Customer[],
  bucket: DemoMutableBucket,
): Customer[] {
  // CRM edits (status, tags, consent, custom fields) ride on the same record
  // billing reads, so overrides have to land here rather than in a CRM-only
  // reader — otherwise the directory and an invoice would disagree.
  return mergeOpsEntities(base, bucket.customers, bucket.customerOverrides ?? {}).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}

export function mergeDemoOffers(base: Offer[], bucket: DemoMutableBucket): Offer[] {
  const byId = new Map<string, Offer>();
  for (const o of base) byId.set(o.id, o);
  for (const o of bucket.offers) byId.set(o.id, o);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeDemoPayments(
  base: Payment[],
  bucket: DemoMutableBucket,
): Payment[] {
  return [...bucket.payments, ...base].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function applyOrderPatches(
  orders: Order[],
  bucket: DemoMutableBucket,
): Order[] {
  return orders.map((order) => ({
    ...order,
    ...(bucket.orderPatches[order.id] ?? {}),
  }));
}

export function mergeDemoProducts(
  base: Product[],
  bucket: DemoMutableBucket,
): Product[] {
  const byId = new Map<string, Product>();
  for (const product of base) {
    byId.set(product.id, {
      ...product,
      ...(bucket.productOverrides[product.id] ?? {}),
    });
  }
  // Products created in the demo workspace are stored in full in the bucket;
  // legacy buckets may predate the field.
  for (const product of bucket.products ?? []) {
    byId.set(product.id, {
      ...product,
      ...(bucket.productOverrides[product.id] ?? {}),
    });
  }
  return Array.from(byId.values());
}

export function listDemoAudit(bucket: DemoMutableBucket) {
  return bucket.auditLog;
}
