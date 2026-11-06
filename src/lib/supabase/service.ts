import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv } from "@/lib/env";

/** Publishable-key client without cookies — for public quote RPCs (RLS + SECURITY DEFINER). */
export function createSupabaseServiceClient() {
  const env = assertPublicEnv();
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
