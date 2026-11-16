#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pre-dev environment gate.
 *
 * The app runs on `data/*.csv` by default, so a checkout with no `.env.local`
 * at all is a valid state and `npm run dev` must work in it. Keys are only
 * required when this deployment actually asks for Supabase, which is exactly
 * the rule `supabaseEnabled()` in src/lib/env.ts applies at runtime — the flag
 * is not enough on its own, the public keys have to be there too.
 */
const root = resolve(import.meta.dirname, "..");
const local = resolve(root, ".env.local");
const text = existsSync(local) ? readFileSync(local, "utf8") : "";

function value(key) {
  /* A commented line is not a setting, so the `#` is deliberately not matched. */
  const file = text.match(new RegExp(`^${key}=(.*)$`, "im"))?.[1];
  const fromEnv = process.env[key];
  return (fromEnv ?? file ?? "").trim();
}

const wantsSupabase = value("OB_USE_SUPABASE").toLowerCase() === "true";
if (!wantsSupabase) {
  console.log(
    "CSV demo mode: reading and writing data/*.csv — no Supabase keys needed.\n" +
      "Set OB_USE_SUPABASE=true in .env.local (npm run setup:env) to switch to Supabase.",
  );
  process.exit(0);
}

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((key) => {
  const v = value(key);
  return !v || v.startsWith("your_");
});

if (missing.length) {
  console.error(
    "OB_USE_SUPABASE=true but these values are missing from .env.local (or from the\n" +
      "environment): " +
      missing.join(", ") +
      "\nEither fill them in, or delete/comment the flag to stay on data/*.csv.",
  );
  process.exit(1);
}

console.log("Supabase mode: keys found. Data comes from Supabase, not data/*.csv.");
