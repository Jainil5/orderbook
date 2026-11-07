import { cookies } from "next/headers";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  AuditLogEntry,
  Customer,
  Offer,
  Order,
  Payment,
  Product,
  Refund,
  StockAdjustment,
} from "@/types/database";
import type { StaffMember } from "@/types/manager";

export const DEMO_MUTABLE_COOKIE = "ob_demo_mutable_v1";

export type DemoMutableBucket = {
  customers: Customer[];
  offers: Offer[];
  payments: Payment[];
  orderPatches: Record<string, Partial<Order>>;
  productOverrides: Record<string, Partial<Product>>;
  auditLog: AuditLogEntry[];
  stockAdjustments: StockAdjustment[];
  refunds: Refund[];
  staff: StaffMember[];
  staffOverrides: Record<string, Partial<StaffMember>>;
};

type DemoMutableStore = Partial<Record<DemoBrandCode, DemoMutableBucket>>;

function emptyBucket(): DemoMutableBucket {
  return {
    customers: [],
    offers: [],
    payments: [],
    orderPatches: {},
    productOverrides: {},
    auditLog: [],
    stockAdjustments: [],
    refunds: [],
    staff: [],
    staffOverrides: {},
  };
}

function parseStore(raw: string | undefined): DemoMutableStore {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DemoMutableStore;
  } catch {
    return {};
  }
}

export async function readDemoMutableBucket(
  brandCode: DemoBrandCode,
): Promise<DemoMutableBucket> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(DEMO_MUTABLE_COOKIE)?.value);
  return store[brandCode] ?? emptyBucket();
}

async function writeDemoMutableStore(store: DemoMutableStore): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_MUTABLE_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function updateDemoMutableBucket(
  brandCode: DemoBrandCode,
  mutate: (bucket: DemoMutableBucket) => DemoMutableBucket,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(DEMO_MUTABLE_COOKIE)?.value);
  const current = store[brandCode] ?? emptyBucket();
  store[brandCode] = mutate(current);
  await writeDemoMutableStore(store);
}

export async function appendDemoAudit(
  brandCode: DemoBrandCode,
  entry: Omit<AuditLogEntry, "id" | "created_at">,
): Promise<void> {
  await updateDemoMutableBucket(brandCode, (bucket) => ({
    ...bucket,
    auditLog: [
      {
        ...entry,
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
      },
      ...bucket.auditLog,
    ].slice(0, 200),
  }));
}
