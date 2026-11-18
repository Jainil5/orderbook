"use client";

import { useState } from "react";
import type { BillDocument } from "@/lib/documents/types";
import { downloadBillPdf } from "@/lib/documents/download-bill-pdf";
import { openBillHtml } from "@/lib/documents/open-bill-html";
import { openWhatsAppWithBill } from "@/lib/messaging/whatsapp";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, MessageCircle } from "lucide-react";

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
  const [htmlBusy, setHtmlBusy] = useState(false);
  const [htmlHint, setHtmlHint] = useState<string | null>(null);
  const [waHint, setWaHint] = useState<string | null>(null);

  const customerName = document.customerName?.trim() ?? "";
  const customerPhone = document.customerPhone?.trim() ?? "";

  const pdfLabel =
    document.kind === "quotation" ? "Download quotation PDF" : "Save bill PDF";

  async function onOpenHtml() {
    setHtmlBusy(true);
    setHtmlHint(null);
    const result = await openBillHtml(document);
    setHtmlBusy(false);
    if (!result.ok) {
      setHtmlHint(result.error);
      return;
    }
    if (result.where === "download") {
      setHtmlHint(
        "Pop-ups are blocked, so the HTML copy was saved to your downloads.",
      );
    }
  }

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
          ? "mt-3 space-y-2 rounded-[var(--ob-radius-md)] border border-[color-mix(in_srgb,var(--ob-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--ob-success)_8%,var(--ob-surface))] p-3"
          : "rounded-[var(--ob-radius-md)] border border-[color-mix(in_srgb,var(--ob-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--ob-success)_8%,var(--ob-surface))] p-4"
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
        Optional: open the document in a browser, send it on WhatsApp, or save a
        PDF. The order is already stored in Orders.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          loading={htmlBusy}
          onClick={onOpenHtml}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Open in browser
        </Button>
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
      {htmlHint ? (
        <p className="text-xs text-[var(--ob-warning)]" role="status">
          {htmlHint}
        </p>
      ) : null}
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
