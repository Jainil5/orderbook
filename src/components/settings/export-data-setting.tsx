"use client";

import { useEffect, useState } from "react";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/cn";
import {
  exportDataCsvAction,
  exportDataMonthsAction,
  type ExportDataset,
  type ExportMonthInfo,
} from "@/services/data-export-actions";

const DATASET_OPTIONS: { id: ExportDataset; label: string }[] = [
  { id: "orders", label: "Bills & quotes" },
  { id: "order_items", label: "Line items" },
  { id: "payments", label: "Payments" },
];

const DATASET_BLURB: Record<ExportDataset, string> = {
  orders: "One row per bill or quotation, priced and dated as the counter saw it.",
  order_items: "One row per sold line, with the modifiers the customer picked.",
  payments: "One row per payment, including the part payments on open bills.",
};

/**
 * The month picker for the Export data tab. A month only appears when that
 * dataset actually has rows in it, so nobody exports an empty file.
 */
export function ExportDataSetting() {
  const [dataset, setDataset] = useState<ExportDataset>("orders");
  const [months, setMonths] = useState<ExportMonthInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    exportDataMonthsAction().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setMonths(result.months);
        setSelected(result.months.slice(0, 1).map((m) => m.key));
      } else {
        setError(result.message);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  function toggle(key: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const visible = (months ?? []).filter((m) =>
    dataset === "payments" ? m.payments > 0 : m.orders > 0,
  );

  return (
    <div className="mt-4 space-y-4">
      <SegmentedControl
        label="What to export"
        value={dataset}
        onChange={(next) => {
          setDataset(next);
          setError(null);
        }}
        options={DATASET_OPTIONS}
      />
      <p className="text-sm text-[var(--ob-text-muted)]">{DATASET_BLURB[dataset]}</p>

      {months === null && !error ? (
        <p className="text-sm text-[var(--ob-text-muted)]">Reading the ledger…</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      {months !== null && visible.length === 0 ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          Nothing to export yet — this business has no dated records for that
          dataset.
        </p>
      ) : null}

      {visible.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ob-label">Months</p>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className="text-[var(--ob-primary)] underline"
                onClick={() => setSelected(visible.map((m) => m.key))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-[var(--ob-text-muted)] underline"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {visible.map((month) => {
              const active = selected.includes(month.key);
              const rows =
                dataset === "payments"
                  ? month.payments
                  : dataset === "order_items"
                    ? month.items
                    : month.orders;
              return (
                <li key={month.key}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(month.key)}
                    className={cn(
                      "ob-press rounded-full border px-3.5 py-1.5 text-sm",
                      active
                        ? "border-[var(--ob-leaf)] bg-[var(--ob-tint-wash)] font-semibold text-[var(--ob-leaf-ink)]"
                        : "border-[var(--ob-border)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
                    )}
                  >
                    {month.label}
                    <span className="ml-1.5 text-xs opacity-70">{rows}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <CsvExportButton
          label={
            selected.length === 1
              ? "Export 1 month as CSV"
              : `Export ${selected.length} months as CSV`
          }
          onExport={() => exportDataCsvAction({ dataset, months: selected })}
        />
        <p className="text-xs text-[var(--ob-text-muted)]">
          Exports what this browser sees, edits included. Nothing is sent to a
          server.
        </p>
      </div>
    </div>
  );
}
