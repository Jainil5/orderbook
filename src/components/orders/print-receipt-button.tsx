"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton({ orderId }: { orderId: string }) {
  function onPrint() {
    window.open(`/print/order/${orderId}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={onPrint}>
      <Printer className="h-4 w-4" aria-hidden />
      Print receipt
    </Button>
  );
}
