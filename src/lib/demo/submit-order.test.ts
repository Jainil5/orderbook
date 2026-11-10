import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@/types/database";

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { matchOrCreateCustomerId } from "./customer-identity";
import { submitDemoOrder } from "./server";
import { getDemoOrder, listDemoCustomers } from "./data";
import { readDemoMutableBucket } from "./mutable-store";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

const existing: Customer = {
  id: "cust-existing",
  brand_id: "demo-brewery-cafe",
  name: "Ananya Mehta",
  email: null,
  phone: "+91 90000 11111",
};

describe("matchOrCreateCustomerId", () => {
  it("links an existing customer by normalized phone", () => {
    const res = matchOrCreateCustomerId(
      [existing],
      "9000011111",
      "Someone Else",
      "demo-brewery-cafe",
    );
    expect(res.id).toBe("cust-existing");
    expect(res.created).toBeUndefined();
  });

  it("creates a customer for an unknown phone, defaulting name to User", () => {
    const res = matchOrCreateCustomerId(
      [existing],
      "9876543210",
      "",
      "demo-brewery-cafe",
    );
    expect(res.id).toBeTruthy();
    expect(res.created).toMatchObject({
      name: "User",
      phone: "9876543210",
      brand_id: "demo-brewery-cafe",
    });
  });

  it("returns null id when no phone is given", () => {
    expect(matchOrCreateCustomerId([existing], "", "Name", "b").id).toBeNull();
    expect(matchOrCreateCustomerId([existing], "123", "Name", "b").id).toBeNull();
  });
});

describe("submitDemoOrder phone identity", () => {
  beforeEach(() => {
    jar.map.clear();
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
  });

  const input = {
    customerId: null,
    lines: [{ productId: "p1", quantity: 1 }],
    paymentMethod: "UPI",
    paymentStatus: "pending" as const,
  };

  it("links a pack customer when the phone matches (no duplicate)", async () => {
    const res = await submitDemoOrder({
      ...input,
      customerPhone: "+91 90000 11111",
      walkInName: "Ignored Name",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const order = await getDemoOrder(res.orderId, "BR-1");
    expect(order?.customer_id).toBe("c2");
    expect(order?.status).toBe("pending");
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.customers).toHaveLength(0);
  });

  it("auto-creates a customer for an unknown phone and links the order", async () => {
    const before = await listDemoCustomers(undefined, "BR-1");
    const res = await submitDemoOrder({
      ...input,
      customerPhone: "9876543210",
      walkInName: "New Guest",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const order = await getDemoOrder(res.orderId, "BR-1");
    expect(order?.customer_id).toMatch(/^demo-cust-/);
    expect(order?.customer_name_snapshot).toBe("New Guest");
    const after = await listDemoCustomers(undefined, "BR-1");
    expect(after).toHaveLength(before.length + 1);
    const created = after.find((c) => c.id === order?.customer_id);
    expect(created).toMatchObject({ name: "New Guest", phone: "9876543210" });

    // Re-submitting the same phone links the same customer, no second record.
    const again = await submitDemoOrder({
      ...input,
      customerPhone: "9876543210",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const second = await getDemoOrder(again.orderId, "BR-1");
    expect(second?.customer_id).toBe(order?.customer_id);
    expect(await listDemoCustomers(undefined, "BR-1")).toHaveLength(
      before.length + 1,
    );
  });

  it("defaults the auto-created name to User when blank", async () => {
    const res = await submitDemoOrder({
      ...input,
      customerPhone: "9111111111",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const order = await getDemoOrder(res.orderId, "BR-1");
    expect(order?.customer_name_snapshot).toBe("User");
  });
});