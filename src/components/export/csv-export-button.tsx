"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function CsvExportButton({
  label,
  onExport,
}: {
  label: string;
  onExport: () => Promise<
    { ok: true; csv: string; filename: string } | { ok: false; message: string }
  >;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const result = await onExport();
    setBusy(false);
    if (!result.ok) {
      setError("message" in result ? result.message : "Export failed.");
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:inline-flex sm:items-end">
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-2 text-xs sm:py-1.5"
        loading={busy}
        onClick={onClick}
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Export</span>
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-[var(--ob-danger)]">{error}</span>
      ) : null}
    </div>
  );
}
