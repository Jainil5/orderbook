"use client";

import {
  listDemoCustomers,
  listDemoProducts,
  submitDemoOrder,
} from "@/lib/demo/data";
import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { BillingPos } from "@/components/billing/billing-pos";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";

export default function DemoBillingPage() {
  const { settings } = useDemoWorkspace();
  const products = listDemoProducts();
  const customers = listDemoCustomers();

  return (
    <DemoPageShell title="Billing">
      <BillingPos
        products={products}
        customers={customers}
        currencyCode={settings.currency_code}
        taxRatePercent={settings.tax_rate_percent ?? 0}
        readOnly
        onSubmitOrder={async (payload) => {
          const result = await submitDemoOrder({
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
    </DemoPageShell>
  );
}
