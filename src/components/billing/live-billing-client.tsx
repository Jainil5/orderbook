"use client";

import type { Customer, Product } from "@/types/database";
import { BillingPos } from "@/components/billing/billing-pos";
import { submitOrderAction } from "@/services/actions";

export function LiveBillingClient({
  products,
  customers,
  currencyCode,
  taxRatePercent,
}: {
  products: Product[];
  customers: Customer[];
  currencyCode: string;
  taxRatePercent: number;
}) {
  return (
    <BillingPos
      products={products}
      customers={customers}
      currencyCode={currencyCode}
      taxRatePercent={taxRatePercent}
      onSubmitOrder={async (payload) => {
        const result = await submitOrderAction({
          customerId: payload.customerId,
          notes: payload.notes,
          lines: payload.lines,
          offerCode: payload.offerCode,
          paymentMethod: payload.paymentMethod,
          paymentStatus: "paid",
        });
        if (result.ok) {
          return {
            ok: true,
            message: "Saved",
            orderNumber: result.orderNumber,
          };
        }
        return { ok: false, message: result.message };
      }}
    />
  );
}
