"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RANGE_PRESETS,
  presetLabel,
  type RangePreset,
} from "@/lib/analytics/date-range";

/**
 * Shared range picker for Dashboard and Analytics.
 *
 * Presets are the fast path (they encode intent in `?range=`), the date
 * inputs are the escape hatch (`?from=&to=`), and explicit dates win in
 * `resolveRange`. Callers must render this inside a Suspense boundary
 * because it reads the search params.
 */
export function RangeSelector({
  basePath,
  initialFrom,
  initialTo,
  initialPreset,
}: {
  basePath: string;
  initialFrom: string;
  initialTo: string;
  initialPreset: RangePreset | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "All time" is unbounded, so the pickers stay blank instead of showing
  // the 1970/9999 sentinel dates used internally for the query.
  const bounded = initialPreset !== "all";
  const resolvedFrom = bounded ? initialFrom.slice(0, 10) : "";
  const resolvedTo = bounded ? initialTo.slice(0, 10) : "";
  const [draft, setDraft] = useState({ from: resolvedFrom, to: resolvedTo });
  // Preset clicks navigate without a remount, so the pickers have to follow
  // the resolved range or they would keep showing the previous one.
  const [seededFrom, setSeededFrom] = useState(resolvedFrom);
  const [seededTo, setSeededTo] = useState(resolvedTo);
  if (resolvedFrom !== seededFrom || resolvedTo !== seededTo) {
    setSeededFrom(resolvedFrom);
    setSeededTo(resolvedTo);
    setDraft({ from: resolvedFrom, to: resolvedTo });
  }

  function go(params: URLSearchParams) {
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function pickPreset(preset: RangePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    params.delete("from");
    params.delete("to");
    go(params);
  }

  function applyCustom() {
    if (!draft.from || !draft.to) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("range");
    params.set("from", draft.from);
    params.set("to", draft.to);
    go(params);
  }

  return (
    <div className="mb-4 ob-card p-3">
      <div
        role="radiogroup"
        aria-label="Date range"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {RANGE_PRESETS.map((preset) => {
          const selected = preset.id === initialPreset;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => pickPreset(preset.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                selected
                  ? "bg-[var(--ob-primary)] text-white"
                  : "border border-[var(--ob-border)] text-[var(--ob-text-secondary)] hover:border-[var(--ob-primary)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-sm">
          <span className="text-xs text-[var(--ob-text-muted)]">From</span>
          <Input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--ob-text-muted)]">To</span>
          <Input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="mt-1"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={applyCustom}
          disabled={!draft.from || !draft.to}
        >
          Apply custom range
        </Button>
        <p className="text-xs text-[var(--ob-text-muted)] sm:ml-auto sm:self-center">
          {initialPreset
            ? `Showing ${presetLabel(initialPreset)}`
            : `Showing ${resolvedFrom} to ${resolvedTo}`}
        </p>
      </div>
    </div>
  );
}
