import {
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOpsEntities, newOpsId } from "@/lib/manager/ops-shared";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  AttendanceRecord,
  CashMovement,
  CashSession,
  Expense,
  LeaveRequest,
  Note,
  PurchaseOrder,
  Supplier,
} from "@/types/business";
import type { ExternalEvent, PendingSyncAction } from "@/types/integrations";

/**
 * Entity collections that the four managers read and write.
 *
 * Each collection is a fixture set (checked-in demo data, per brand) merged
 * with the demo mutable bucket (user edits), using the same tombstone/override
 * merge the operations collections already use. Live workspaces keep these on
 * the Supabase side once `docs/DATABASE_CONTRACT.md` tables exist.
 */
export type BusinessCollections = {
  notes: Note;
  expenses: Expense;
  suppliers: Supplier;
  purchaseOrders: PurchaseOrder;
  attendance: AttendanceRecord;
  leave: LeaveRequest;
  cashMovements: CashMovement;
  cashSessions: CashSession;
  externalEvents: ExternalEvent;
  syncActions: PendingSyncAction;
};

export type BusinessCollectionKey = keyof BusinessCollections;

export type Collection<T> = {
  key: BusinessCollectionKey;
  load(brandCode: DemoBrandCode): Promise<T[]>;
  append(brandCode: DemoBrandCode, entity: T): Promise<void>;
  patch(brandCode: DemoBrandCode, id: string, value: Partial<T>): Promise<void>;
  remove(brandCode: DemoBrandCode, id: string): Promise<void>;
  nextId(): string;
};

type ListKey = keyof DemoMutableBucket & BusinessCollectionKey;

export function createCollection<T extends { id: string }>(params: {
  key: BusinessCollectionKey;
  idPrefix: string;
  fixtures: (brandCode: DemoBrandCode) => T[];
}): Collection<T> {
  const listKey = params.key as ListKey;
  const overrideKey = `${params.key}Overrides` as keyof DemoMutableBucket;

  return {
    key: params.key,
    async load(brandCode) {
      const bucket = await readDemoMutableBucket(brandCode);
      return mergeOpsEntities(
        params.fixtures(brandCode),
        (bucket[listKey] ?? []) as unknown as T[],
        (bucket[overrideKey] ?? {}) as Record<
          string,
          Partial<T> & { deleted?: boolean }
        >,
      );
    },
    async append(brandCode, entity) {
      await updateDemoMutableBucket(brandCode, (bucket) => ({
        ...bucket,
        [listKey]: [...((bucket[listKey] ?? []) as unknown as T[]), entity],
      }));
    },
    async patch(brandCode, id, value) {
      await updateDemoMutableBucket(brandCode, (bucket) => {
        const overrides = (bucket[overrideKey] ?? {}) as Record<
          string,
          Partial<T>
        >;
        return {
          ...bucket,
          [overrideKey]: { ...overrides, [id]: { ...overrides[id], ...value } },
        };
      });
    },
    async remove(brandCode, id) {
      await updateDemoMutableBucket(brandCode, (bucket) => {
        const overrides = (bucket[overrideKey] ?? {}) as Record<
          string,
          Partial<T>
        >;
        return {
          ...bucket,
          [overrideKey]: { ...overrides, [id]: { ...overrides[id], deleted: true } },
        };
      });
    },
    nextId() {
      return newOpsId(params.idPrefix);
    },
  };
}
