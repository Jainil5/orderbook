"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setManagerModuleHidden } from "@/lib/auth/settings-actions";
import { MANAGER_MODULES, type ManagerModuleKey } from "@/lib/workspace/manager-modules";

export function ManagerModulesSetting({
  hidden,
  canEdit,
}: {
  hidden: ManagerModuleKey[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [hiddenState, setHiddenState] = useState(hidden);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(key: ManagerModuleKey, visible: boolean) {
    if (!canEdit || pending) return;
    setPending(true);
    setError(null);
    const result = await setManagerModuleHidden(key, !visible);
    setPending(false);
    if (result.ok) {
      setHiddenState((prev) =>
        visible ? prev.filter((k) => k !== key) : [...prev, key],
      );
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <span className="font-medium">Manager modules</span>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Hide modules this business doesn&apos;t use. Hidden modules disappear from
        the sidebar and Manager sub-navigation.
      </p>
      <div className="mt-3 space-y-2">
        {MANAGER_MODULES.map((module) => {
          const visible = !hiddenState.includes(module.key);
          return (
            <label
              key={module.key}
              className="ob-touch-target flex items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={visible}
                disabled={!canEdit || pending}
                onChange={(e) => onToggle(module.key, e.target.checked)}
              />
              {module.label}
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--ob-danger)]">{error}</p> : null}
    </div>
  );
}