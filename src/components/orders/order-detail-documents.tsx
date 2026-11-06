"use client";

import type { BillDocument } from "@/lib/documents/types";
import { OrderDocumentActions } from "@/components/billing/order-document-actions";
import { Card } from "@/components/ui/card";

export function OrderDetailDocuments({ document }: { document: BillDocument }) {
  return (
    <Card className="mt-4">
      <h2 className="font-semibold">Share or download</h2>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        {document.kind === "quotation"
          ? "Send the quotation on WhatsApp or save a PDF copy."
          : "Send the bill on WhatsApp or save a PDF to your computer."}
      </p>
      <div className="mt-4">
        <OrderDocumentActions document={document} compact />
      </div>
    </Card>
  );
}
