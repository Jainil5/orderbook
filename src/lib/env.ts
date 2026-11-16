import { isTrustedSupabaseUrl } from "@/lib/security/input";

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type PublicEnvError = {
  ok: false;
  missing: string[];
};

export function getPublicEnv(): PublicEnv | PublicEnvError {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabasePublishableKey)
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const url = supabaseUrl!;
  const key = supabasePublishableKey!;

  if (!isTrustedSupabaseUrl(url)) {
    return { ok: false, missing: ["NEXT_PUBLIC_SUPABASE_URL (invalid host)"] };
  }

  if (
    process.env.NODE_ENV === "production" &&
    /placeholder|your_supabase/i.test(key)
  ) {
    return {
      ok: false,
      missing: [
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (placeholder not allowed in production)",
      ],
    };
  }

  return {
    supabaseUrl: url,
    supabasePublishableKey: key,
  };
}

export function assertPublicEnv(): PublicEnv {
  const env = getPublicEnv();
  if (!("ok" in env)) return env;
  throw new Error(
    `Missing required environment variables: ${env.missing.join(", ")}. See .env.example.`,
  );
}

/**
 * Deployment-wide switch for Supabase.
 *
 * The app currently runs CSV-first: every read and write goes through the
 * `data/*.csv` layer, and all Supabase code paths are dormant (kept in the
 * repo, commented out at the call sites by this single switch). Set
 * `OB_USE_SUPABASE="true"` *and* the `NEXT_PUBLIC_SUPABASE_*` keys to switch
 * live mode back on — until then Railway and local dev are pure CSV.
 */
/**
 * Whether this deployment asked for Supabase at all.
 *
 * The switch alone is not "live": `supabaseEnabled()` also needs working keys.
 * This is what the setup warnings read, because a CSV-only deployment is missing
 * keys on purpose and must not be told to configure them.
 */
export function supabaseRequested(): boolean {
  return process.env.OB_USE_SUPABASE?.trim() === "true";
}

export function supabaseEnabled(): boolean {
  if (!supabaseRequested()) return false;
  return !("ok" in getPublicEnv());
}

/**
 * The one way to fail a Supabase call while the switch is off.
 *
 * Every live call site already branches on `supabaseEnabled()`, so reaching
 * this means new code forgot to. Throwing here says what is actually true —
 * this deployment runs on `data/*.csv` — instead of the misleading
 * "Missing required environment variables" from `assertPublicEnv()`. When the
 * switch IS on but the keys are wrong, `assertPublicEnv()` stays the one that
 * reports, because there the message is genuinely actionable.
 */
export function requireSupabaseEnabled(): void {
  if (supabaseRequested()) return;
  throw new Error(
    "Supabase is switched off for this deployment: data is served from data/*.csv. " +
      'Set OB_USE_SUPABASE="true" with the NEXT_PUBLIC_SUPABASE_* keys to enable live mode.',
  );
}
