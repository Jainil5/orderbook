import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

/**
 * The cookie is transport; the row is the session.
 *
 * `beginDemoSession` is the only place a login is created, so this drives it
 * with a fake jar and then checks the two things that matter: the file gained a
 * row, and the browser got a token that names it — never the brand code.
 */

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  })),
}));

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  cookieJar.clear();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-demo-session-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

async function api() {
  return import("@/lib/workspace/demo-session");
}

describe("demo session cookie", () => {
  it("signing in puts a token in the jar and a row in the file", async () => {
    const a = await api();
    await a.beginDemoSession("BR-2");

    const token = cookieJar.get(DEMO_WORKSPACE_COOKIE);
    expect(typeof token).toBe("string");
    expect(token).not.toContain("BR-2");
    expect(await a.readDemoSessionBrand()).toBe("BR-2");

    const text = fs.readFileSync(path.join(tmpDir!, "sessions.csv"), "utf8");
    expect(text).not.toContain(token);
    expect((await import("@/lib/csv/store")).readAllRows("sessions")).toHaveLength(
      1,
    );
  });

  it("a jar with nothing in it is no session, and the fallback is the first demo", async () => {
    const a = await api();
    expect(await a.readDemoSessionBrand()).toBeNull();
    expect(await a.readDemoSessionBrandOrDefault()).toBe("BR-1");

    /* An old cookie that still carries a brand code is not a session either —
       that shape has no row behind it. */
    cookieJar.set(DEMO_WORKSPACE_COOKIE, "BR-1");
    expect(await a.readDemoSessionBrand()).toBeNull();
  });

  it("signing out clears both sides", async () => {
    const a = await api();
    await a.beginDemoSession("BR-1");
    const token = cookieJar.get(DEMO_WORKSPACE_COOKIE)!;

    await a.clearDemoSession();
    expect(cookieJar.has(DEMO_WORKSPACE_COOKIE)).toBe(false);
    expect(await a.readDemoSessionBrand()).toBeNull();
    /* The row is gone too, not just the browser's copy of the key: a token
       lifted from the logs before sign-out no longer opens anything. */
    const { resolveDemoSession } = await import("@/lib/csv/session-store");
    expect(resolveDemoSession(token)).toBeNull();
    expect((await import("@/lib/csv/store")).readAllRows("sessions")).toHaveLength(0);
  });

  it("a second sign-in replaces the brand's session instead of adding one", async () => {
    const a = await api();
    await a.beginDemoSession("BR-1");
    const first = cookieJar.get(DEMO_WORKSPACE_COOKIE)!;
    await a.beginDemoSession("BR-2");
    const second = cookieJar.get(DEMO_WORKSPACE_COOKIE)!;

    expect(second).not.toBe(first);
    expect(await a.readDemoSessionBrand()).toBe("BR-2");
    expect((await import("@/lib/csv/store")).readAllRows("sessions")).toHaveLength(
      1,
    );
    // The replaced row cannot come back, even with the old token in hand.
    const { resolveDemoSession } = await import("@/lib/csv/session-store");
    expect(resolveDemoSession(first)).toBeNull();
  });
});
