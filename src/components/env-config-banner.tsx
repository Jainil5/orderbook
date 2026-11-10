import { getPublicEnv } from "@/lib/env";

export function EnvConfigBanner() {
  const env = getPublicEnv();
  if (!("ok" in env)) return null;

  return (
    <div
      role="alert"
      className="border-b border-[color-mix(in_srgb,var(--ob-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--ob-warning)_12%,transparent)] px-3 py-2 text-center text-xs text-[var(--ob-warning)] sm:px-4 sm:text-sm"
    >
      Configuration required: missing {env.missing.join(", ")}. Copy{" "}
      <code className="rounded bg-[color-mix(in_srgb,var(--ob-warning)_20%,transparent)] px-1">.env.example</code> to{" "}
      <code className="rounded bg-[color-mix(in_srgb,var(--ob-warning)_20%,transparent)] px-1">.env.local</code> and set
      values in Railway for production.
    </div>
  );
}
