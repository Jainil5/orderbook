"use client";

import type { BrandRole, Customer, Offer, Product } from "@/types/database";
import { BillingPos, type BillBrandSettings } from "@/components/billing/billing-pos";
import { submitOrderAction } from "@/services/actions";
import { submitDemoOrder } from "@/lib/demo/server";
import type { BillingDocumentMode, BillingPosCopy } from "@/lib/workspace/constants";
import {
  RETAIL_BILLING_COPY,
} from "@/lib/workspace/constants";

export function BillingWorkspace({
  mode,
  documentMode = "retail",
  products,
  customers,
  offers,
  currencyCode,
  taxRatePercent,
  billingCopy = RETAIL_BILLING_COPY,
  brandName,
  brandCode,
  brandSettings,
  receiptHeader,
  receiptFooter,
  userRole = "owner",
  blockOversell = false,
}: {
  mode: "live" | "demo";
  documentMode?: BillingDocumentMode;
  products: Product[];
  customers: Customer[];
  offers: Offer[];
  currencyCode: string;
  taxRatePercent: number;
  billingCopy?: BillingPosCopy;
  brandName: string;
  brandCode?: string;
  brandSettings?: BillBrandSettings;
  receiptHeader: string;
  receiptFooter: string | null;
  userRole?: BrandRole;
  blockOversell?: boolean;
}) {
  return (
    <BillingPos
      products={products}
      customers={customers}
      offers={offers}
      userRole={userRole}
      currencyCode={currencyCode}
      taxRatePercent={taxRatePercent}
      copy={billingCopy}
      documentMode={documentMode}
      brandName={brandName}
      brandCode={brandCode}
      brandSettings={brandSettings}
      receiptHeader={receiptHeader}
      receiptFooter={receiptFooter}
      blockOversell={blockOversell}
      onSubmitOrder={async (payload) => {
        const input = {
          customerId: null,
          customerPhone: payload.customerPhone,
          walkInName: payload.walkInName,
          notes: payload.notes,
          lines: payload.lines,
          offerCode: payload.offerCode,
          paymentMethod: payload.paymentMethod,
          paymentStatus: "pending" as const,
          saveAsQuote: payload.saveAsQuote,
          orderDiscount: payload.orderDiscount,
          tableTag: payload.tableTag,
          deliveryNotes: payload.deliveryNotes,
          depositPercent: payload.depositPercent,
          orderType: payload.orderType,
          serviceDate: payload.serviceDate,
          guests: payload.guests,
          deliveryAddress: payload.deliveryAddress,
          paymentReference: payload.paymentReference,
        };
        if (mode === "demo") {
          const result = await submitDemoOrder(input);
          if (result.ok) {
            return {
              ok: true,
              message: "Order saved",
              orderNumber: result.orderNumber,
              savedAsQuote: payload.saveAsQuote,
            };
          }
          return { ok: false, message: result.message };
        }

        const result = await submitOrderAction(input);
        if (result.ok) {
          return {
            ok: true,
            message: "Order saved",
            orderNumber: result.orderNumber,
            savedAsQuote: payload.saveAsQuote,
          };
        }
        return { ok: false, message: result.message };
      }}
    />
  );
}
