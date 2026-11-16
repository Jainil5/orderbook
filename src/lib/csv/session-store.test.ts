import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isDemoSessionTokenValue } from "@/lib/workspace/constants";
import { csvBrandId } from "@/lib/csv/source";

/**
 * Login state lives in `data/sessions.csv`, not in the browser.
 *
 * What these tests hold the design to:
 * - the file carries a hash, so it cannot be used to sign in;
 * - a token means nothing without its row, so deleting the row is a
 *   revocation an owner can do with a text editor;
 * - one live row per brand, and an expired row is not state the app keeps.
 */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-sessions-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  vi.useRealTimers();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

async function sessionStore() {
  return import("@/lib/csv/session-store");
}

function file(): string {
  return path.join(tmpDir!, "sessions.csv");
}

describe("demo sessions in csv", () => {
  it("signing in writes a row, and the row is not the token", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-1");

    expect(fs.existsSync(file())).toBe(true);
    const text = fs.readFileSync(file(), "utf8");
    /* The browser's secret never reaches the file — only its digest does, so
     * reading or leaking sessions.csv hands over no way to sign in. */
    expect(text).not.toContain(token);
    expect(text).toContain(s.hashDemoSessionToken(token));
    expect(text.split("\n")[1]).toContain(csvBrandId("BR-1"));
  });

  it("resolves a token to its brand, and refuses one with no row", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-2");

    expect(s.resolveDemoSession(token)).toBe("BR-2");
    expect(s.resolveDemoSession(`${token}x`)).toBeNull();
    expect(s.resolveDemoSession(undefined)).toBeNull();
    expect(s.resolveDemoSession("")).toBeNull();
  });

  it("a token signed before a restart still works, the row being the state", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-1");

    // A new module graph is as close to a new process as a unit test gets: the
    // only thing that survives is the file.
    vi.resetModules();
    const after = await sessionStore();
    expect(after.resolveDemoSession(token)).toBe("BR-1");
  });

  it("signing out ends the session, and deleting the row does the same", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-1");

    expect(s.endDemoSession(token)).toBe(true);
    expect(s.resolveDemoSession(token)).toBeNull();
    // Signing out twice is not an error worth reporting, just nothing to do.
    expect(s.endDemoSession(token)).toBe(false);

    // The owner's way of revoking: edit the file, no admin screen needed.
    const again = s.createDemoSession("BR-1");
    const { replaceAllRows } = await import("@/lib/csv/store");
    replaceAllRows("sessions", []);
    expect(s.resolveDemoSession(again)).toBeNull();
  });

  it("keeps one live row per brand and leaves the other brand alone", async () => {
    const s = await sessionStore();
    const first = s.createDemoSession("BR-1");
    const other = s.createDemoSession("BR-2");
    const reentered = s.createDemoSession("BR-1");

    const { readAllRows } = await import("@/lib/csv/store");
    const rows = readAllRows("sessions");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.brand_id).sort()).toEqual(
      [csvBrandId("BR-1"), csvBrandId("BR-2")].sort(),
    );

    /* A re-login replaces that brand's key; the other brand keeps its session. */
    expect(s.resolveDemoSession(first)).toBeNull();
    expect(s.resolveDemoSession(reentered)).toBe("BR-1");
    expect(s.resolveDemoSession(other)).toBe("BR-2");
  });

  it("an expired row is dropped from the file, not just ignored", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-1");

    const { SESSION_TTL_MS } = s;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS + 60_000));

    expect(s.resolveDemoSession(token)).toBeNull();
    const { readAllRows } = await import("@/lib/csv/store");
    expect(readAllRows("sessions")).toHaveLength(0);
    expect(fs.readFileSync(file(), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("a row naming a brand this build does not ship is not a session", async () => {
    const s = await sessionStore();
    const token = s.createDemoSession("BR-1");
    const { replaceAllRows, readAllRows } = await import("@/lib/csv/store");
    /* Someone hand-edited the file — the whole point of CSV being editable is
       that this can happen, so it must fail closed. */
    replaceAllRows(
      "sessions",
      readAllRows("sessions").map((row) => ({ ...row, brand_id: "demo-gone" })),
    );
    expect(s.resolveDemoSession(token)).toBeNull();
  });

  it("seeding creates the table but never a login", async () => {
    const { readAllRows } = await import("@/lib/csv/store");
    expect(readAllRows("sessions")).toHaveLength(0);
    expect(fs.readFileSync(file(), "utf8").trim()).toBe(
      "id,brand_id,token_hash,created_at,expires_at",
    );
  });

  it("the shape check accepts a real token and refuses a brand code", async () => {
    const s = await sessionStore();
    /* Middleware cannot read a file, so this is all it may decide on: a token
     * shape goes on to the layout, everything else goes to the login screen. */
    expect(isDemoSessionTokenValue(s.createDemoSession("BR-1"))).toBe(true);
    expect(isDemoSessionTokenValue("BR-1")).toBe(false);
    expect(isDemoSessionTokenValue("https://example.com")).toBe(false);
    expect(isDemoSessionTokenValue(undefined)).toBe(false);
  });
});
