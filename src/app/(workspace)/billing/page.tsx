import {
  listDemoCustomers,
  listDemoOffers,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { PageShell } from "@/components/workspace/page-shell";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const quotationEnabled = Boolean(ws.settings.quotation_builder_enabled);
  const documentMode = quotationEnabled ? "bill" : "retail";
  const pageTitle = quotationEnabled
    ? (ws.profile.billingPos.billCartTitle ?? ws.profile.billingPageTitle)
    : ws.profile.billingPageTitle;

  const demoCode = toDemoBrandCode(ws.brand.code);
  const [products, customers, offers] = await Promise.all([
    listDemoProductsMerged({ activeOnly: true }, demoCode),
    listDemoCustomers(undefined, demoCode),
    listDemoOffers(demoCode),
  ]);
  return (
    <PageShell title={pageTitle}>
      <BillingWorkspace
        documentMode={documentMode}
        captureMode={ws.profile.capture}
        products={products}
        customers={customers}
        offers={offers}
        currencyCode={ws.settings.currency_code}
        taxRatePercent={ws.settings.tax_rate_percent ?? 0}
        billingCopy={ws.profile.billingPos}
        brandName={ws.brand.name}
        brandCode={ws.brand.code}
        brandSettings={{
          contact_email: ws.settings.contact_email,
          contact_phone: ws.settings.contact_phone,
          brand_website_url: ws.settings.brand_website_url,
          receipt_header: ws.settings.receipt_header,
        }}
        receiptHeader={ws.settings.receipt_header ?? ws.brand.name}
        receiptFooter={ws.settings.receipt_footer ?? null}
        blockOversell={Boolean(ws.settings.block_oversell)}
      />
    </PageShell>
  );
}