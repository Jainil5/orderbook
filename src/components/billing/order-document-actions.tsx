"use client";

import { useState } from "react";
import type { BillDocument } from "@/lib/documents/types";
import { downloadBillPdf } from "@/lib/documents/download-bill-pdf";
import { openWhatsAppWithBill } from "@/lib/messaging/whatsapp";
import { Button } from "@/components/ui/button";
import { Download, MessageCircle } from "lucide-react";

export function OrderDocumentActions({
  document,
  onDismiss,
  compact = false,
}: {
  document: BillDocument;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [waHint, setWaHint] = useState<string | null>(null);

  const customerName = document.customerName?.trim() ?? "";
  const customerPhone = document.customerPhone?.trim() ?? "";

  const pdfLabel =
    document.kind === "quotation" ? "Download quotation PDF" : "Save bill PDF";

  async function onDownloadPdf() {
    setPdfBusy(true);
    try {
      await downloadBillPdf(document);
    } finally {
      setPdfBusy(false);
    }
  }

  function onWhatsApp() {
    setWaHint(null);
    if (!document.customerPhone?.trim()) {
      setWaHint("Add a mobile number on the order to send on WhatsApp.");
      return;
    }
    const ok = openWhatsAppWithBill(document);
    if (!ok) {
      setWaHint("Could not open WhatsApp — check the mobile number.");
    }
  }

  return (
    <div
      className={
        compact
          ? "mt-3 space-y-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-success)]/30 bg-emerald-50/50 p-3 dark:bg-emerald-950/20"
          : "rounded-[var(--ob-radius-md)] border border-[var(--ob-success)]/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/20"
      }
    >
      <p className="text-sm font-medium text-[var(--ob-success)]">
        {document.kind === "quotation" ? "Quotation saved" : "Bill saved"} —{" "}
        {document.orderNumber}
      </p>
      {customerName || customerPhone ? (
        <p className="text-xs text-[var(--ob-text-muted)]">
          {customerName ? (
            <span className="font-medium text-[var(--ob-text)]">
              {customerName}
            </span>
          ) : null}
          {customerName && customerPhone ? " · " : null}
          {customerPhone ? (
            <span>
              {customerName ? null : "Mobile "}
              {customerPhone}
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="text-xs text-[var(--ob-text-muted)]">
        Optional: send on WhatsApp or save a PDF. The order is already stored in
        Orders.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onWhatsApp}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Send on WhatsApp
        </Button>
        <Button
          type="button"
          className="flex-1"
          loading={pdfBusy}
          onClick={onDownloadPdf}
        >
          <Download className="h-4 w-4" aria-hidden />
          {pdfLabel}
        </Button>
      </div>
      {waHint ? (
        <p className="text-xs text-[var(--ob-warning)]" role="status">
          {waHint}
        </p>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="text-xs text-[var(--ob-text-muted)] underline"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
