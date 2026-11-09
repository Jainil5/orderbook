import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderItem } from "@/types/database";

// In-memory cookie jar that mimics the browser: a Set-Cookie whose encoded
// value exceeds 4096 bytes is silently dropped (RFC 6265 minimum support).
const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      if (encodeURIComponent(value).length > 4096) return;
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import {
  appendDemoOrderRecord,
  patchDemoOrderInStore,
  readDemoOrderStore,
} from "./order-store";
import { readDemoMutableBucket, updateDemoMutableBucket } from "./mutable-store";
import {
  readChunkedCookie,
  writeChunkedCookie,
  type CookieJar,
} from "./chunked-cookie";

function order(n: number): Order {
  return {
    id: `order-${n}`,
    brand_id: "demo-brewery-cafe",
    order_number: `BC-900${n}`,
    status: "completed",
    payment_status: "pending",
    customer_id: null,
    customer_name_snapshot: null,
    subtotal: 620,
    discount_total: 0,
    tax_total: 31,
    fees_total: 0,
    grand_total: 651,
    notes: "Table 7 — walk-in order with a reasonably long note to add weight",
    created_at: new Date(2026, 10, 8, 12, n).toISOString(),
    table_tag: "Table 7",
  };
}

function items(n: number): OrderItem[] {
  return [
    {
      id: `item-${n}-a`,
      order_id: `order-${n}`,
      product_id: "p10",
      product_name_snapshot: "Flat White",
      quantity: 2,
      unit_price: 220,
      line_discount: 0,
      line_total: 440,
    },
    {
      id: `item-${n}-b`,
      order_id: `order-${n}`,
      product_id: "p18",
      product_name_snapshot: "Peri Peri Fries",
      quantity: 1,
      unit_price: 180,
      line_discount: 0,
      line_total: 180,
    },
  ];
}

describe("demo cookie stores beyond the 4KB per-cookie limit", () => {
  beforeEach(() => {
    jar.map.clear();
  });

  it("keeps every appended order once the payload exceeds one cookie", async () => {
    for (let n = 1; n <= 8; n++) {
      await appendDemoOrderRecord("BR-1", order(n), items(n));
    }
    const bucket = await readDemoOrderStore("BR-1");
    expect(bucket.orders.map((o) => o.id)).toEqual([
      "order-8",
      "order-7",
      "order-6",
      "order-5",
      "order-4",
      "order-3",
      "order-2",
      "order-1",
    ]);
    expect(bucket.orderItems).toHaveLength(16);
  });

  it("migrates a legacy single-cookie store on the next write", async () => {
    jar.map.set(
      "ob_demo_orders_v1",
      JSON.stringify({ "BR-1": { orders: [order(1)], orderItems: items(1) } }),
    );
    expect((await readDemoOrderStore("BR-1")).orders.map((o) => o.id)).toEqual([
      "order-1",
    ]);
    await appendDemoOrderRecord("BR-1", order(2), items(2));
    expect(jar.map.has("ob_demo_orders_v1")).toBe(false);
    expect(jar.map.has("ob_demo_orders_v1_c0")).toBe(true);
    expect((await readDemoOrderStore("BR-1")).orders.map((o) => o.id)).toEqual([
      "order-2",
      "order-1",
    ]);
  });

  it("patches an order in an over-sized store", async () => {
    for (let n = 1; n <= 8; n++) {
      await appendDemoOrderRecord("BR-1", order(n), items(n));
    }
    expect(await patchDemoOrderInStore("BR-1", "order-1", { payment_status: "paid" })).toBe(
      true,
    );
    const bucket = await readDemoOrderStore("BR-1");
    expect(bucket.orders.find((o) => o.id === "order-1")?.payment_status).toBe("paid");
    expect(bucket.orders).toHaveLength(8);
  });

  it("keeps mutable bucket writes once the payload exceeds one cookie", async () => {
    for (let n = 1; n <= 20; n++) {
      await updateDemoMutableBucket("BR-1", (bucket) => ({
        ...bucket,
        auditLog: [
          {
            id: `audit-${n}`,
            brand_id: "demo-brewery-cafe",
            actor_email: null,
            action: "order.saved",
            entity_type: "order",
            entity_id: `order-${n}`,
            detail: `Saved order BC-900${n} for a walk-in guest at Table 7`,
            created_at: new Date(2026, 10, 8, 12, n).toISOString(),
          },
          ...bucket.auditLog,
        ],
      }));
    }
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.auditLog).toHaveLength(20);
    expect(bucket.auditLog[0].id).toBe("audit-20");
  });

  it("preserves orders whose notes overflow a raw chunk once URL-encoded", async () => {
    const multibyte = order(1);
    // Each ₹ encodes to 9 chars (%E2%82%B9): 700 of them blow past 4096
    // encoded bytes inside a single 1200-code-unit chunk.
    multibyte.notes = "₹".repeat(700);
    await appendDemoOrderRecord("BR-1", multibyte, items(1));
    const bucket = await readDemoOrderStore("BR-1");
    expect(bucket.orders.map((o) => o.id)).toEqual(["order-1"]);
    expect(bucket.orders[0].notes).toBe(multibyte.notes);
  });

  it("chunks by encoded length and never splits surrogate pairs", () => {
    const value = "🎉".repeat(1500) + "₹".repeat(1500) + "ascii".repeat(300);
    writeChunkedCookie(jar, "ob_unit", value);
    expect(readChunkedCookie(jar, "ob_unit")).toBe(value);
    for (const [name, stored] of jar.map) {
      if (name.startsWith("ob_unit")) {
        expect(encodeURIComponent(stored).length).toBeLessThanOrEqual(4096);
      }
    }
  });

  it("keeps the legacy cookie when the browser drops a shard write", () => {
    const map = new Map<string, string>([["ob_guard", "legacy-complete-store"]]);
    const droppingJar: CookieJar = {
      get: (name) => (map.has(name) ? { value: map.get(name)! } : undefined),
      set: (name, value) => {
        // Simulate the browser silently dropping one shard.
        if (name === "ob_guard_c1") return;
        map.set(name, value);
      },
      delete: (name) => {
        map.delete(name);
      },
    };
    writeChunkedCookie(droppingJar, "ob_guard", "x".repeat(5000));
    expect(map.get("ob_guard")).toBe("legacy-complete-store");
    expect(readChunkedCookie(droppingJar, "ob_guard")).toBe("legacy-complete-store");
  });
});
