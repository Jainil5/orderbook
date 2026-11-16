"use server";

import { redirect } from "next/navigation";
import { supabaseEnabled } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveDemoBrandCode } from "@/lib/demo/brands/packs";
import { safeInternalPath } from "@/lib/security/input";
import { beginDemoSession } from "@/lib/workspace/demo-session";
import {
  DEFAULT_DEMO_BRAND_CODE,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

/**
 * "Explore the demo" — sign into a demo workspace with no password.
 *
 * This is the only way a session comes into existence: it writes a row in
 * `data/sessions.csv` and gives the browser the matching token. Nothing here
 * decides which brand a request belongs to; that is
 * `src/lib/workspace/demo-session.ts`, so entering, reading and leaving a demo
 * workspace all go through the same table.
 */
export async function enterDemoWorkspace(
  brandCode: DemoBrandCode = DEFAULT_DEMO_BRAND_CODE,
  next?: string | null,
) {
  // Entering a demo workspace means leaving any real session behind. With
  // Supabase switched off there is no auth session to clear — and building a
  // client anyway used to throw here, which broke demo entry on a keyless
  // deployment: the very setup this build is for.
  if (supabaseEnabled()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  /* The action's argument arrives from the browser, so it is narrowed to a
     brand this build actually ships before it can name a session row. */
  await beginDemoSession(resolveDemoBrandCode(brandCode));
  // Where a demo link wanted to land, or the dashboard. `safeInternalPath`
  // refuses anything that is not a path on this site.
  redirect(safeInternalPath(next));
}
