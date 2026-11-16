import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import { demoNotes } from "@/lib/demo/business/notes";
import { demoSuppliers } from "@/lib/demo/business/procurement";
import type { Note } from "@/types/business";

/**
 * The Manager collections are a view over one CSV table each — there is no
 * in-browser store layered on top any more. These tests are the proof of that:
 * every mutation is asserted against the *file*, and one of them re-reads
 * through a fresh module graph, which is the closest thing to a server restart
 * a unit test can do.
 */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-collections-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

/** A full row, because the encoder only writes the columns a table declares. */
function makeNote(id: string, title: string): Note {
  const now = new Date().toISOString();
  return {
    id,
    brand_id: "",
    title,
    body: "",
    category: "general",
    scope: "shared",
    pinned: false,
    linkedCustomerId: null,
    linkedStaffId: null,
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: now,
    updated_at: now,
  };
}

function notesCollection() {
  return import("./collections").then(({ createCollection }) =>
    createCollection<Note>({
      key: "notes",
      idPrefix: "note",
      /* Unused: the rows were fixtures and `seed.ts` already wrote them into
         notes.csv, so a collection never needs its own copy. */
      fixtures: () => [],
    }),
  );
}

function notesFile() {
  return fs.readFileSync(path.join(tmpDir!, "notes.csv"), "utf8");
}

describe("business collections on csv", () => {
  it("loads the brand's seeded rows from the table", async () => {
    const collection = await notesCollection();
    const pack = getRawDemoBrandPack("BR-1");

    const rows = await collection.load("BR-1");
    expect(rows).toHaveLength(demoNotes("BR-1").length);
    expect(rows.every((n) => n.brand_id === pack.brand.id)).toBe(true);
  });

  it("appends, patches and removes through the file, stamping the brand itself", async () => {
    const collection = await notesCollection();
    const pack = getRawDemoBrandPack("BR-1");

    const id = collection.nextId();
    expect(id.startsWith("note-")).toBe(true);
    /* A caller-supplied brand must never win — `saveBrand` overwrites it with
       the session's brand, which is what keeps tenancy out of client input. */
    await collection.append("BR-1", {
      ...makeNote(id, "Supplier invoice"),
      brand_id: "some-other-brand",
    });
    expect(notesFile()).toContain("Supplier invoice");

    const saved = (await collection.load("BR-1")).find((n) => n.id === id);
    expect(saved?.brand_id).toBe(pack.brand.id);

    await collection.patch("BR-1", id, { pinned: true });
    expect((await collection.load("BR-1")).find((n) => n.id === id)?.pinned).toBe(
      true,
    );

    await collection.remove("BR-1", id);
    expect((await collection.load("BR-1")).some((n) => n.id === id)).toBe(false);
    expect(notesFile()).not.toContain(id);
  });

  it("keeps another brand's rows out of reach for every verb", async () => {
    const collection = await notesCollection();
    const other = demoNotes("BR-2")[0];
    expect(other).toBeDefined();

    await collection.patch("BR-1", other.id, { title: "rewritten" });
    await collection.remove("BR-1", other.id);

    expect((await collection.load("BR-1")).some((n) => n.id === other.id)).toBe(
      false,
    );
    /* BR-2's row is untouched — a wrong-brand write is a no-op, not a delete
       that leaked across tenants. */
    const stillThere = (await collection.load("BR-2")).find(
      (n) => n.id === other.id,
    );
    expect(stillThere?.title).toBe(other.title);
  });

  it("an appended row survives a restart: a fresh module graph reads it from disk", async () => {
    const collection = await notesCollection();
    const id = collection.nextId();
    await collection.append("BR-1", makeNote(id, "Before the deploy"));

    /* Dropping the module registry discards the store's read cache exactly the
       way a new process would; only the file can still answer. */
    vi.resetModules();
    const { readBrandRows } = await import("@/lib/csv/store");
    const pack = getRawDemoBrandPack("BR-1");
    const row = readBrandRows("notes", pack.brand.id).find((r) => r.id === id);
    expect(row?.title).toBe("Before the deploy");
  });

  it("knownRefs and the staff roster come from the tables the writes use", async () => {
    const { knownRefs } = await import("./validate");
    const { listDemoStaff } = await import("@/lib/demo/staff-data");
    const pack = getRawDemoBrandPack("BR-1");

    const refs = await knownRefs("BR-1");
    expect(refs.customerIds.sort()).toEqual(
      pack.customers.map((c) => c.id).sort(),
    );
    expect(refs.supplierIds.sort()).toEqual(
      demoSuppliers("BR-1").map((s) => s.id).sort(),
    );
    expect(refs.serviceIds.sort()).toEqual(
      pack.services.map((s) => s.id).sort(),
    );

    const staff = await listDemoStaff("BR-1");
    expect(staff).toHaveLength(pack.staff.length);
    const names = staff.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("a supplier hand-written into suppliers.csv is immediately referenceable", async () => {
    const { upsertRow } = await import("@/lib/csv/store");
    const pack = getRawDemoBrandPack("BR-1");
    upsertRow("suppliers", {
      id: "sup-hand-written",
      brand_id: pack.brand.id,
      name: "Hand-written roaster",
      contactName: null,
      phone: null,
      email: null,
      category: null,
      leadTimeDays: null,
      paymentTerms: null,
      notes: "",
      is_active: true,
      created_at: new Date().toISOString(),
    });

    const { knownRefs } = await import("./validate");
    expect((await knownRefs("BR-1")).supplierIds).toContain("sup-hand-written");
  });

  it("auditBusinessOps writes the brand's audit_log.csv", async () => {
    const { auditBusinessOps } = await import("./actions-kit");
    const { listAudit } = await import("@/lib/csv/records");
    const pack = getRawDemoBrandPack("BR-1");
    const other = getRawDemoBrandPack("BR-2");

    await auditBusinessOps(
      { code: "BR-1", brandId: pack.brand.id },
      "note.created",
      "note",
      "n1",
      "First note",
    );

    const rows = listAudit(pack.brand.id);
    expect(rows[0]).toMatchObject({
      action: "note.created",
      entity_type: "note",
      entity_id: "n1",
      detail: "First note",
      brand_id: pack.brand.id,
    });
    expect(listAudit(other.brand.id)).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir!, "audit_log.csv"))).toBe(true);
  });
});
