/**
 * The cookie side of a demo session.
 *
 * A session is a row in `data/sessions.csv` (see `src/lib/csv/session-store.ts`
 * for why it lives there); this file only moves the token between the request
 * and that table, so every reader of "which brand is signed in" goes through
 * the same three lines and none of them keeps state of its own.
 *
 * It is deliberately not a `"use server"` module: `src/lib/demo/server.ts`, the
 * workspace session and the server actions all import it, and a plain module
 * can be imported anywhere on the server without turning each function into an
 * endpoint.
 */

import { cookies } from "next/headers";
import {
  createDemoSession,
  endDemoSession,
  resolveDemoSession,
} from "@/lib/csv/session-store";
import {
  DEMO_WORKSPACE_COOKIE,
  DEFAULT_DEMO_BRAND_CODE,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

/* The browser holds the key for as long as the row can live; a shorter cookie
   would drop a still-valid session, and a longer one would be a lie. */
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

async function requestToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value;
}

/**
 * Sign in: write the row, then hand the browser its token. In that order a
 * failure before the write leaves no cookie pointing at nothing.
 *
 * Whatever this browser was signed into is ended first, so the table only ever
 * holds sessions somebody can actually use: switching demo workspaces replaces
 * the row instead of leaving one behind that nobody can reach.
 */
export async function beginDemoSession(code: DemoBrandCode): Promise<void> {
  endDemoSession(await requestToken());
  const token = createDemoSession(code);
  const cookieStore = await cookies();
  cookieStore.set(DEMO_WORKSPACE_COOKIE, token, cookieOptions);
}

/** Which demo brand this request is signed in as, or `null` for none. */
export async function readDemoSessionBrand(): Promise<DemoBrandCode | null> {
  return resolveDemoSession(await requestToken());
}

/**
 * The same answer for the write paths that have always fallen back to the
 * first demo workspace when nothing is signed in — a public quote link, or an
 * action fired by a screen the owner opened before the session expired.
 */
export async function readDemoSessionBrandOrDefault(): Promise<DemoBrandCode> {
  return (await readDemoSessionBrand()) ?? DEFAULT_DEMO_BRAND_CODE;
}

/**
 * Sign out: the row goes, then the cookie. Removing the row is what makes this
 * real — a copied cookie stops working even if it is still in the jar.
 */
export async function clearDemoSession(): Promise<void> {
  const token = await requestToken();
  endDemoSession(token);
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_WORKSPACE_COOKIE);
}
