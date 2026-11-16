"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  applyIndustryPreset,
  setManagerSectionsHidden,
} from "@/lib/auth/settings-actions";
import {
  asSectionKey,
  type ManagerModuleKey,
} from "@/lib/workspace/manager-modules";
import {
  INDUSTRY_PRESETS,
  MANAGERS,
  type IndustryId,
} from "@/lib/workspace/managers";

type SectionToggle = { key: ManagerModuleKey; label: string; description: string };

export function ManagerModulesSetting({
  hidden,
  industry,
  canEdit,
}: {
  hidden: ManagerModuleKey[];
  industry: IndustryId;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [hiddenState, setHiddenState] = useState<ManagerModuleKey[]>(hidden);
  const [industryState, setIndustryState] = useState<IndustryId>(industry);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(key: ManagerModuleKey, visible: boolean) {
    if (!canEdit || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await setManagerSectionsHidden([key], !visible);
      if (result.ok) {
        setHiddenState(result.hidden);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onPresetChange(next: IndustryId) {
    if (!canEdit || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await applyIndustryPreset(next);
      if (result.ok) {
        setIndustryState(next);
        setHiddenState(result.hidden);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not apply the preset. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <span className="font-medium">Business type &amp; Manager modules</span>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Pick the business type closest to yours to switch on the managers it
        uses, then fine-tune individual sections. Hidden sections disappear
        from the sidebar, Manager navigation and dashboards.
      </p>

      <label className="mt-3 block max-w-xs text-sm">
        <span className="text-[var(--ob-text-muted)]">Business type</span>
        <select
          className="ob-input mt-1 w-full"
          value={industryState}
          disabled={!canEdit || pending}
          onChange={(e) => onPresetChange(e.target.value as IndustryId)}
        >
          {INDUSTRY_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 space-y-4">
        {MANAGERS.map((manager) => {
          const sections: SectionToggle[] = manager.sections.flatMap((s) => {
            const key = asSectionKey(s.key);
            return key
              ? [{ key, label: s.navLabel, description: s.description }]
              : [];
          });
          if (!sections.length) return null;
          return (
            <div key={manager.key}>
              <p className="text-sm font-medium">{manager.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {sections.map((section) => {
                  const visible = !hiddenState.includes(section.key);
                  return (
                    <label
                      key={section.key}
                      className="ob-touch-target flex items-start gap-3 text-sm"
                      title={section.description}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={visible}
                        disabled={!canEdit || pending}
                        onChange={(e) => onToggle(section.key, e.target.checked)}
                      />
                      <span>{section.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-[var(--ob-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
