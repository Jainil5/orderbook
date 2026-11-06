import { getPublicEnv } from "@/lib/env";

export function EnvConfigBanner() {
  const env = getPublicEnv();
  if (!("ok" in env)) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 sm:px-4 sm:text-sm"
    >
      Configuration required: missing {env.missing.join(", ")}. Copy{" "}
      <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code> and set
      values in Railway for production.
    </div>
  );
}
