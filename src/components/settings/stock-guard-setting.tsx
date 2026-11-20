"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setBlockOversell } from "@/lib/auth/settings-actions";

/**
 * Whether the counter is allowed to sell past the shelf. Off, a cashier can
 * still ring up a Flat White when the milk is out — the line is flagged, but
 * the sale goes through, which is what a busy service needs. On, the sale is
 * refused, which is what a business that cannot make the item needs.
 */
export function StockGuardSetting({
  initialEnabled,
  canEdit,
}: {
  initialEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: boolean) {
    if (!canEdit || next === enabled) return;
    setPending(true);
    setError(null);
    const result = await setBlockOversell(next);
    setPending(false);
    if (result.ok) {
      setEnabled(next);
      router.refresh();
    } else {
      setError("Could not save. Try again.");
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <label className="block">
        <span className="font-medium">Refuse sales the shelf cannot cover</span>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          Billing counts every recipe item by what the shelf can actually make,
          so a Flat White is judged by the milk and not by a number typed on the
          coffee.{" "}
          <strong>Refuse</strong> stops the line outright when the shelf says
          zero; <strong>Warn</strong> still shows the count and lets a manager
          override it during service.
        </p>
        <select
          className="ob-input mt-3 max-w-md"
          value={enabled ? "block" : "warn"}
          disabled={!canEdit || pending}
          onChange={(e) => onChange(e.target.value === "block")}
          aria-label="Oversell policy"
        >
          <option value="warn">Warn — allow the override</option>
          <option value="block">Refuse — never oversell</option>
        </select>
      </label>
      {!canEdit ? (
        <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
          Only owners and managers can change this in live workspaces.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
