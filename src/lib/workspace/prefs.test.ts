import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import { parseCsv } from "@/lib/csv/codec";

/**
 * `/settings` state is a CSV row now, not a browser cookie.
 *
 * The distinction that matters is the one `src/lib/workspace/session.ts` relies
 * on: `undefined` means "never set, so the fixtures decide" and `null` means
 * "the owner cleared it". Both have to survive a write to a text file, where an
 * empty cell is ambiguous.
 */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-prefs-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

async function prefs() {
  return import("./prefs");
}

function row(): Record<string, unknown> {
  // Read the bytes and decode them with the real parser, so a cell that needed
  // quoting still lands under its own column: the file is the contract here.
  const text = fs.readFileSync(path.join(tmpDir!, "brand_settings.csv"), "utf8");
  const [header, first] = parseCsv(text);
  return Object.fromEntries(header.map((k, i) => [k, first[i]]));
}

describe("workspace prefs on csv", () => {
  it("seeds one row per demo brand from that brand's own fixture settings", async () => {
    const p = await prefs();
    const pack = getRawDemoBrandPack("BR-1");
    expect(await p.readReceiptSettingsPref("BR-1")).toMatchObject({
      receiptHeader: pack.settings.receipt_header,
      receiptFooter: pack.settings.receipt_footer,
    });
    /* Columns the fixtures never answered stay "unset", so the pack decides. */
    expect(await p.readManagerModulesPref("BR-1")).toBeUndefined();
    expect(await p.readIndustryPref("BR-1")).toBeUndefined();
  });

  it("a saved receipt header is a row in brand_settings.csv", async () => {
    const p = await prefs();
    await p.writeReceiptSettingsPref("BR-1", {
      receiptHeader: "Brewery Cafe — Downtown",
      receiptFooter: null,
      contactEmail: "hello@brewery-cafe.demo",
      contactPhone: null,
    });

    expect(row().receipt_header).toBe("Brewery Cafe — Downtown");
    expect(await p.readReceiptSettingsPref("BR-1")).toMatchObject({
      receiptHeader: "Brewery Cafe — Downtown",
      /* `null` is a cleared value and must read back as null, not undefined. */
      receiptFooter: null,
    });
  });

  it("only the touched keys change, and only for that brand", async () => {
    const p = await prefs();
    /* BR-2's own fixture answer is what must still be there afterwards,
     * whatever it happens to be. */
    const beforeOther = await p.readQuotationBuilderPref("BR-2");
    const beforeReceipt = await p.readReceiptSettingsPref("BR-2");
    await p.writeQuotationBuilderPref("BR-1", true);

    expect(await p.readQuotationBuilderPref("BR-1")).toBe(true);
    expect(await p.readQuotationBuilderPref("BR-2")).toBe(beforeOther);
    expect(await p.readReceiptSettingsPref("BR-2")).toEqual(beforeReceipt);
  });

  it("hidden manager modules survive as json in the row", async () => {
    const p = await prefs();
    await p.writeManagerModulesPref("BR-1", ["inventory", "cash"]);
    expect(await p.readManagerModulesPref("BR-1")).toEqual(["inventory", "cash"]);

    /* A hand-written junk cell must not crash the session or hide everything: */
    const { replaceAllRows } = await import("@/lib/csv/store");
    replaceAllRows("brand_settings", [
      {
        id: "demo-brewery-cafe",
        brand_id: "demo-brewery-cafe",
        receipt_header: "Brewery Cafe",
        hidden_manager_modules: "not json",
        quotation_builder_enabled: false,
        updated_at: new Date().toISOString(),
      },
    ]);
    /* `parseHiddenManagerModules` narrows anything unshaped to "nothing
     * hidden", which is the safe reading for a nav the owner still needs. */
    expect(await p.readManagerModulesPref("BR-1")).toEqual([]);
  });

  it("the integration and AI areas share the row without disturbing each other", async () => {
    const p = await prefs();
    const entry = await p.readPrefsEntry("BR-1");
    await p.updatePrefsEntry("BR-1", {
      ...entry,
      integrations: {
        status: { google_calendar: { lastSyncAt: "2026-01-02T09:00:00.000Z" } },
      },
    });
    const afterIntegrations = await p.readPrefsEntry("BR-1");
    expect(afterIntegrations.integrations?.status?.google_calendar?.lastSyncAt).toBe(
      "2026-01-02T09:00:00.000Z",
    );
    expect(afterIntegrations.receiptHeader).toBe(entry.receiptHeader);

    await p.updatePrefsEntry("BR-1", {
      ...(await p.readPrefsEntry("BR-1")),
      aiAutomationPrefs: { "restock-low-stock": true },
    });
    const final = await p.readPrefsEntry("BR-1");
    expect(final.aiAutomationPrefs).toEqual({ "restock-low-stock": true });
    expect(final.integrations?.status?.google_calendar?.lastSyncAt).toBe(
      "2026-01-02T09:00:00.000Z",
    );
  });

  it("a brand with no row yet gets exactly one, keyed by its own code", async () => {
    const p = await prefs();
    await p.writeBrandWebsitePref("ACME", null);
    const { readAllRows } = await import("@/lib/csv/store");
    const rows = readAllRows("brand_settings");
    expect(rows.filter((r) => r.id === "ACME")).toHaveLength(1);
    /* `null` written for a never-set brand is a real "no website" answer. */
    expect(await p.readBrandWebsitePref("ACME")).toBeNull();
  });
});
