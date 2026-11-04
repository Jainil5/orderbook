import {
  listDemoCustomers,
  listDemoProducts,
} from "@/lib/demo/data";
import { listCustomers, listProducts } from "@/services/data";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import { PageShell } from "@/components/workspace/page-shell";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    return (
      <PageShell title="Billing">
        <BillingWorkspace
          mode="demo"
          products={listDemoProducts({ activeOnly: true })}
          customers={listDemoCustomers()}
          currencyCode={ws.settings.currency_code}
          taxRatePercent={ws.settings.tax_rate_percent ?? 0}
        />
      </PageShell>
    );
  }

  const [productsRes, customersRes] = await Promise.all([
    listProducts({ activeOnly: true }),
    listCustomers(),
  ]);

  return (
    <PageShell title="Billing">
      {productsRes.error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{productsRes.error}</p>
      ) : null}
      <BillingWorkspace
        mode="live"
        products={productsRes.data}
        customers={customersRes.data}
        currencyCode={ws.settings.currency_code}
        taxRatePercent={ws.settings.tax_rate_percent ?? 0}
      />
    </PageShell>
  );
}
