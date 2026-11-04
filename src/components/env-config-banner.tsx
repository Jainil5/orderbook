import { getPublicEnv } from "@/lib/env";

export function EnvConfigBanner() {
  const env = getPublicEnv();
  if (!("ok" in env)) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      Configuration required: missing {env.missing.join(", ")}. Copy{" "}
      <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code> and set
      values in Railway for production.
    </div>
  );
}
