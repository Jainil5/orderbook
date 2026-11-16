import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseCsv, formatCsv } from "@/lib/csv/codec";
import {
  CSV_TABLES,
  TABLE_SCHEMAS,
  decodeCell,
  decodeRow,
  encodeCell,
  encodeRow,
} from "@/lib/csv/schema";
import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import { csvPackFor, csvBrandId } from "@/lib/csv/source";

/* ------------------------------------------------------------------ */
/* codec                                                               */
/* ------------------------------------------------------------------ */

describe("csv codec", () => {
  it("round-trips tricky values (commas, quotes, newlines)", () => {
    const rows = [
      ["id", "name", "notes"],
      ["1", 'He said "hi", loudly', "line1\nline2"],
      ["2", "plain", ""],
    ];
    expect(parseCsv(formatCsv(rows))).toEqual(rows);
  });

  it("handles CRLF and skips blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("parses empty input to no rows", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* schema                                                              */
/* ------------------------------------------------------------------ */

describe("csv schema", () => {
  it("every table starts with id; every table but order_items has brand_id", () => {
    for (const table of CSV_TABLES) {
      const columns = TABLE_SCHEMAS[table].columns;
      expect(columns[0].name).toBe("id");
      const hasBrand = columns.some((col) => col.name === "brand_id");
      expect(hasBrand).toBe(table !== "order_items");
    }
  });

  it("products row survives an encode/decode round trip", () => {
    const product = {
      id: "p1",
      brand_id: "b1",
      name: "Filter Coffee",
      description: "with commas, and \"quotes\"",
      sku: null,
      category: "Coffee",
      price: 4.5,
      cost_price: 2.25,
      unit: "cup",
      is_active: true,
      default_discount_percent: null,
      image_url: null,
      stock_qty: 12,
      low_stock_threshold: null,
      wholesale_price: null,
      modifiers_json: [{ id: "m1", name: "Extra shot", price: 0.75 }],
    };
    expect(decodeRow("products", encodeRow("products", product))).toEqual(
      product,
    );
  });

  it("cell kinds decode the way the columns are typed", () => {
    expect(decodeCell("str", "")).toBe(""); // str keeps "" (it is not nullable)
    expect(decodeCell("strN", "")).toBe(null); // strN maps blank to null
    expect(decodeCell("num", "")).toBe(0);
    expect(decodeCell("num", "7.77")).toBe(7.77);
    expect(decodeCell("numN", "")).toBe(null);
    expect(decodeCell("bool", "true")).toBe(true);
    expect(decodeCell("bool", "1")).toBe(true);
    expect(decodeCell("bool", "false")).toBe(false);
    expect(decodeCell("jsonN", "")).toBe(null);
    expect(decodeCell("json", "{\"a\":[1,2]}")).toEqual({ a: [1, 2] });
    expect(encodeCell("bool", false)).toBe("false");
    expect(encodeCell("numN", null)).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* seeding + the CSV-is-the-source proof                               */
/* ------------------------------------------------------------------ */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-csv-test-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

describe("csv store seeding", () => {
  it("auto-seeds every table from the fixtures on first read", async () => {
    const { readAllRows } = await import("@/lib/csv/store");
    // stock_adjustments starts empty (history arrives via app edits or hand
    // writes); sync_actions is the pending-integration queue, also empty.
    // refunds and audit_log are pure app output — there is no fixture history
    // for money that was never refunded or actions that were never taken, so
    // `seed.ts` deliberately returns [] and the tables fill up as the demo is used.
    // sessions too: a row means someone is signed in, so seeding one would
    // hand every visitor of a fresh checkout a live login.
    const maySeedEmpty = new Set([
      "stock_adjustments",
      "sync_actions",
      "refunds",
      "audit_log",
      "sessions",
    ]);
    for (const table of CSV_TABLES) {
      const rows = readAllRows(table);
      if (maySeedEmpty.has(table)) {
        expect(Array.isArray(rows)).toBe(true);
      } else {
        expect(rows.length, table).toBeGreaterThan(0);
      }
      expect(fs.existsSync(path.join(tmpDir!, TABLE_SCHEMAS[table].file))).toBe(
        true,
      );
    }
  });

  it("seeded products match the raw fixture pack exactly", async () => {
    const { readBrandRows } = await import("@/lib/csv/store");
    const pack = getRawDemoBrandPack("BR-1");
    const rows = readBrandRows("products", pack.brand.id);
    expect(rows.length).toBe(pack.products.length);
    expect(rows.map((r) => r.name).sort()).toEqual(
      pack.products.map((p) => p.name).sort(),
    );
  });

  it("THE PROOF: editing products.csv changes what the app views read", async () => {
    const store = await import("@/lib/csv/store");
    store.readAllRows("products"); // generates products.csv from the fixtures
    const file = path.join(tmpDir!, "products.csv");

    // Append one raw line by hand, in the file's own column order — exactly
    // what an owner editing the CSV outside the app would do.
    const header = fs.readFileSync(file, "utf8").split("\n")[0].split(",");
    const cellsFor = (values: Record<string, string>) =>
      header.map((name) => values[name] ?? "").join(",");
    const brandId = csvBrandId("BR-1");
    const line = cellsFor({
      id: "csv-sentinel-product",
      brand_id: brandId,
      name: "CSV SENTINEL ESPRESSO",
      category: "Coffee",
      price: "7.77",
      unit: "each",
      is_active: "true",
    });
    fs.writeFileSync(file, `${fs.readFileSync(file, "utf8").trimEnd()}\n${line}\n`, "utf8");

    const { listDemoProducts } = await import("@/lib/demo/data");
    const names = listDemoProducts({}, "BR-1").map((p) => p.name);
    expect(names).toContain("CSV SENTINEL ESPRESSO");

    const pack = csvPackFor("BR-1");
    const sentinel = pack.products.find((p) => p.id === "csv-sentinel-product");
    expect(sentinel).toBeDefined();
    expect(sentinel?.price).toBe(7.77); // num column decoded from text
    expect(sentinel?.is_active).toBe(true); // bool column decoded from text

    // order_items is scoped through the brand's orders, not a brand_id column.
    expect(pack.orderItems.length).toBeGreaterThan(0);
    const orderIds = new Set(pack.orders.map((o) => o.id));
    for (const item of pack.orderItems) expect(orderIds.has(item.order_id)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* auth behavior without Supabase env (the Railway crash)              */
/* ------------------------------------------------------------------ */

describe("csv auth guards", () => {
  it("password sign-in degrades to a friendly error; live workspace to null", async () => {
    vi.doMock("@/lib/env", () => ({
      getPublicEnv: () => ({ ok: false, missing: ["url", "key"] }),
      supabaseEnabled: () => false, // CSV-only deployment switch is off
      getServerEnv: () => ({
        supabaseUrl: "",
        supabaseAnonKey: "",
        supabaseServiceRoleKey: "",
        publishableKey: "",
        secretKey: "",
      }),
      assertPublicEnv: () => {
        throw new Error("Missing Supabase environment variables.");
      },
      assertServerEnv: () => {
        throw new Error("Missing Supabase environment variables.");
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: () => undefined,
        set: () => {},
        delete: () => {},
      }),
      headers: () => new Map(),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => {
        throw new Error("Supabase is not configured for this deployment");
      },
    }));

    const { loadLiveWorkspace, loginWithBrandCode, logoutAction } =
      await import("@/lib/auth/actions");

    // These must not throw the missing-env error (the Railway crash):
    await expect(loadLiveWorkspace()).resolves.toBeNull();

    const formData = new FormData();
    formData.set("brandCode", "BR-1");
    formData.set("password", "whatever");
    const result = await loginWithBrandCode(null, formData);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/CSV/i);

    // Logout takes the demo branch: clear cookie + redirect. Whatever it
    // throws, it must NOT be the Supabase-missing error.
    let logoutError: unknown = null;
    try {
      await logoutAction();
    } catch (errorThrown) {
      logoutError = errorThrown;
    }
    const message =
      logoutError instanceof Error
        ? logoutError.message
        : String(logoutError ?? "");
    expect(message).not.toMatch(/Supabase|Missing Supabase|environment variable/i);
  });
});
