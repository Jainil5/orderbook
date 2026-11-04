import { listCustomers, listProducts } from "@/services/data";
import { LiveBillingClient } from "@/components/billing/live-billing-client";
import { LivePageShell } from "@/components/workspace/live-page-shell";
import { loadLiveWorkspace } from "@/lib/auth/actions";

export default async function BillingPage() {
  const ws = await loadLiveWorkspace();
  const [productsRes, customersRes] = await Promise.all([
    listProducts({ activeOnly: true }),
    listCustomers(),
  ]);

  return (
    <LivePageShell title="Billing">
      {productsRes.error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{productsRes.error}</p>
      ) : null}
      <LiveBillingClient
        products={productsRes.data}
        customers={customersRes.data}
        currencyCode={ws?.settings.currency_code ?? "INR"}
        taxRatePercent={ws?.settings.tax_rate_percent ?? 0}
      />
    </LivePageShell>
  );
}
