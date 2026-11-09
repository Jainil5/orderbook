import { Suspense } from "react";
import { PageShell } from "@/components/workspace/page-shell";
import { CustomerSearchBar } from "@/components/customers/customer-search-bar";
import { CustomersTable } from "@/components/customers/customers-table";
import { CustomerEditor } from "@/components/customers/customer-editor";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { exportCustomersCsvAction } from "@/services/operations-actions";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import { listCustomers } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  let customers;
  let error: string | undefined;

  if (ws.mode === "demo") {
    customers = await listDemoCustomers(query || undefined, toDemoBrandCode(ws.brand.code));
  } else {
    const result = await listCustomers(query || undefined);
    customers = result.data;
    error = result.error;
  }

  return (
    <PageShell
      title="Customers"
      headerActions={
        <CsvExportButton label="Export CSV" onExport={exportCustomersCsvAction} />
      }
    >
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h2 className="font-semibold">Add customer</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Saved customers appear in Billing.
          </p>
          <div className="mt-3">
            <CustomerEditor />
          </div>
        </Card>
        <div className="lg:col-span-2">
          <Suspense
            fallback={
              <div className="h-10 max-w-md animate-pulse rounded-md bg-[var(--ob-surface-muted)]" />
            }
          >
            <CustomerSearchBar initialQuery={query} />
          </Suspense>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {customers.length === 0 ? (
        <EmptyState
          title={query ? "No matching customers" : "No customers"}
          description={
            query ? "Try a different name or phone number." : undefined
          }
        />
      ) : (
        <CustomersTable customers={customers} />
      )}
    </PageShell>
  );
}
