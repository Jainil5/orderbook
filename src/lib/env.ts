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

  return {
    supabaseUrl: supabaseUrl!,
    supabasePublishableKey: supabasePublishableKey!,
  };
}

export function assertPublicEnv(): PublicEnv {
  const env = getPublicEnv();
  if (!("ok" in env)) return env;
  throw new Error(
    `Missing required environment variables: ${env.missing.join(", ")}. See .env.example.`,
  );
}
