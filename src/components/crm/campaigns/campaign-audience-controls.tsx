"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CsvExportButton } from "@/components/export/csv-export-button";
import {
  exportCampaignAudienceCsvAction,
  rebuildCampaignAudienceAction,
} from "@/services/crm-campaign-actions";

/**
 * The two audience-level writes a person makes by hand:
 * rebuild the recipient list from the segment + consent, and export the
 * contact list so the actual send can happen outside OrderBook.
 */
export function AudienceRebuildButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  async function onClick() {
    setBusy(true);
    const result = await rebuildCampaignAudienceAction(campaignId);
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Audience rebuilt." });
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-1.5 text-xs"
        loading={busy}
        onClick={onClick}
      >
        Rebuild audience from segment
      </Button>
      {status.kind !== "idle" ? (
        <span
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error"
              ? "text-xs text-[var(--ob-danger)]"
              : "text-xs text-[var(--crm-lab-strong)]"
          }
        >
          {status.message}
        </span>
      ) : null}
    </span>
  );
}

export function CampaignAudienceExportButton({ campaignId }: { campaignId: string }) {
  return (
    <CsvExportButton
      label="Export contact list"
      onExport={() => exportCampaignAudienceCsvAction(campaignId)}
    />
  );
}
