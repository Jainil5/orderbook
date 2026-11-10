import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      if (encodeURIComponent(value).length > 8192) return;
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setDemoProductUnavailable } from "./server";
import { readDemoMutableBucket, updateDemoMutableBucket } from "./mutable-store";
import { mergeDemoProducts } from "./merge-entities";
import { getDemoBrandPack } from "./brands";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

describe("setDemoProductUnavailable (pack product p1)", () => {
  beforeEach(() => {
    jar.map.clear();
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
  });

  const mergedUnavailable = async () => {
    const pack = getDemoBrandPack("BR-1");
    const bucket = await readDemoMutableBucket("BR-1");
    const merged = mergeDemoProducts(pack.products, bucket);
    return merged.find((p) => p.id === "p1");
  };

  it("round-trips true then false without the value vanishing", async () => {
    expect((await setDemoProductUnavailable("p1", true)).ok).toBe(true);
    expect((await mergedUnavailable())?.unavailable).toBe(true);

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.productOverrides.p1).toMatchObject({ unavailable: true });

    expect((await setDemoProductUnavailable("p1", false)).ok).toBe(true);
    expect((await mergedUnavailable())?.unavailable).toBe(false);

    const after = await readDemoMutableBucket("BR-1");
    expect(after.productOverrides.p1.unavailable).toBe(false);
  });

  it("rejects an unknown product id", async () => {
    expect(await setDemoProductUnavailable("ghost", true)).toEqual({
      ok: false,
      error: "Product not found.",
    });
  });

  it("persists the flag on a demo-created product", async () => {
    await updateDemoMutableBucket("BR-1", (b) => ({
      ...b,
      products: [
        ...b.products,
        {
          id: "demo-prod-new",
          brand_id: "demo-brewery-cafe",
          name: "Special",
          description: null,
          sku: null,
          category: null,
          price: 100,
          unit: null,
          is_active: true,
        },
      ],
    }));

    expect((await setDemoProductUnavailable("demo-prod-new", true)).ok).toBe(true);
    const pack = getDemoBrandPack("BR-1");
    const bucket = await readDemoMutableBucket("BR-1");
    const merged = mergeDemoProducts(pack.products, bucket);
    expect(merged.find((p) => p.id === "demo-prod-new")?.unavailable).toBe(true);
  });
});
