import { createBrowserClient } from "@supabase/ssr";
import { assertPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = assertPublicEnv();
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
