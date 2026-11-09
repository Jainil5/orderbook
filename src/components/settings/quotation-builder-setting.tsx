"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setQuotationBuilderEnabled } from "@/lib/auth/settings-actions";
import Link from "next/link";

export function QuotationBuilderSetting({
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
    const result = await setQuotationBuilderEnabled(next);
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
        <span className="font-medium">Quotation mode</span>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          When enabled, the sidebar shows separate <strong>Quotation</strong> and{" "}
          <strong>Bill</strong> tabs (with product photos on quotes only). When
          off, everyone uses a single Billing screen for orders and payments.
        </p>
        <select
          className="ob-input mt-3 max-w-md"
          value={enabled ? "on" : "off"}
          disabled={!canEdit || pending}
          onChange={(e) => onChange(e.target.value === "on")}
          aria-label="Quotation mode"
        >
          <option value="off">Off — Billing only</option>
          <option value="on">On — Quotation + Bill tabs</option>
        </select>
      </label>
      {!canEdit ? (
        <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
          Only owners and managers can change this in live workspaces.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      <div className="mt-4">
        <Link
          href="/products"
          className="text-sm font-medium text-[var(--ob-primary)]"
        >
          Manage catalog &amp; offers →
        </Link>
      </div>
    </div>
  );
}
