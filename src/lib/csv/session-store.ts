/**
 * Demo sign-in state as a table: `data/sessions.csv`, one live row per brand.
 *
 * Why a table at all: the demo used to put the brand code itself into an
 * httpOnly cookie, so "who is logged in" existed only inside one browser. You
 * could not see it, it disappeared with the browser's cookies, and a workspace
 * that never asked for a password was still being remembered in a place nobody
 * audits. The row is the login record now — its presence is the session, and
 * deleting it signs that session out.
 *
 * The browser still carries a token, because an HTTP request has to identify
 * itself somehow, but it is a random key with no meaning of its own:
 * - 24 random bytes, base64url, never written to the file;
 * - the row keeps `token_hash` = SHA-256 of the token, so reading or leaking
 *   `sessions.csv` hands over no way to sign in;
 * - a token is only accepted while its row lives, so the file is also the
 *   complete list of sessions the app will honour.
 *
 * Signing in again for a brand replaces that brand's row: one live session per
 * demo brand, so the file stays short and what you see is what the app accepts.
 *
 * Nothing here touches `next/headers` — the cookie side lives in
 * `src/lib/workspace/demo-session.ts`, which keeps this file plain Node and
 * easy to test.
 */

import crypto from "node:crypto";
import {
  DEMO_BRAND_CODES,
  type DemoBrandCode,
} from "@/lib/workspace/constants";
import { csvBrandId } from "./source";
import { readAllRows, replaceAllRows } from "./store";

export type SessionRow = {
  id: string;
  brand_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
};

/** A month: long enough that a demo does not log itself out mid-presentation. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** `demo-brewery-cafe` -> `BR-1`, the same pairing every other table uses. */
const CODE_BY_BRAND_ID = new Map<string, DemoBrandCode>(
  DEMO_BRAND_CODES.map((code) => [csvBrandId(code), code]),
);

export function hashDemoSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function isLive(row: SessionRow, nowMs: number): boolean {
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > nowMs;
}

/**
 * Live rows only, and an expired row leaves the file the first time anything
 * reads it: a session that has run out is not state worth keeping, and this is
 * what makes the limit real rather than decorative.
 */
function liveRows(nowMs: number): SessionRow[] {
  const rows = readAllRows("sessions") as unknown as SessionRow[];
  const live = rows.filter((row) => isLive(row, nowMs));
  if (live.length !== rows.length) replaceAllRows("sessions", live);
  return live;
}

/**
 * Start a session for a demo brand and return its token — the only place a
 * token exists, since the row keeps nothing but its hash.
 */
export function createDemoSession(code: DemoBrandCode): string {
  const nowMs = Date.now();
  const brandId = csvBrandId(code);
  const token = newToken();
  const row: SessionRow = {
    id: `session-${nowMs}`,
    brand_id: brandId,
    token_hash: hashDemoSessionToken(token),
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + SESSION_TTL_MS).toISOString(),
  };
  /* One live session per brand: a re-login replaces the old row instead of
     piling up keys nobody can revoke by looking at the file. */
  const kept = liveRows(nowMs).filter((existing) => existing.brand_id !== brandId);
  replaceAllRows("sessions", [...kept, row]);
  return token;
}

/** Which demo brand a request's cookie belongs to, or `null` for no session. */
export function resolveDemoSession(
  token: string | null | undefined,
): DemoBrandCode | null {
  const clean = token?.trim();
  if (!clean) return null;
  const tokenHash = hashDemoSessionToken(clean);
  const row = liveRows(Date.now()).find((r) => r.token_hash === tokenHash);
  if (!row) return null;
  /* A row naming a brand this build does not ship — a hand-edited id, or an
     old file kept after a brand was removed — is not a session. */
  return CODE_BY_BRAND_ID.get(row.brand_id) ?? null;
}

/**
 * Sign a token out. The return value distinguishes "logged out" from "you were
 * not signed in", which matters because an owner can prune this file by hand:
 * deleting a row is a revocation, not a crash.
 */
export function endDemoSession(token: string | null | undefined): boolean {
  const clean = token?.trim();
  if (!clean) return false;
  const tokenHash = hashDemoSessionToken(clean);
  const rows = liveRows(Date.now());
  const kept = rows.filter((r) => r.token_hash !== tokenHash);
  if (kept.length === rows.length) return false;
  replaceAllRows("sessions", kept);
  return true;
}
