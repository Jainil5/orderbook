import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { CustomerOrdersTable } from "@/components/customers/customer-orders-table";
import { CustomerEditor } from "@/components/customers/customer-editor";
import {
  getDemoCustomer,
  listDemoOrdersForCustomer,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { listOrdersByCustomerId } from "@/services/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { Card } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const customer = await getDemoCustomer(customerId, code);
    if (!customer) notFound();
    const orders = await listDemoOrdersForCustomer(customerId, code);

    return (
      <PageShell
        title={customer.name}
        headerActions={
          <Link href="/customers" className="text-sm text-[var(--ob-primary)]">
            Back
          </Link>
        }
      >
        <Card className="mb-6 p-4">
          <h2 className="font-semibold">Edit customer</h2>
          <div className="mt-3">
            <CustomerEditor customer={customer} />
          </div>
        </Card>
        <h2 className="mb-3 text-sm font-semibold">Orders</h2>
        <CustomerOrdersTable
          orders={orders}
          currencyCode={ws.settings.currency_code}
          orderNumberColumn={ws.profile.ordersNumberColumn}
        />
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, brand_id, name, email, phone, notes")
    .eq("id", customerId)
    .eq("brand_id", ws.brand.id)
    .maybeSingle();

  if (!customer) notFound();

  const { data: orders, error } = await listOrdersByCustomerId(customerId);

  return (
    <PageShell
      title={customer.name}
      headerActions={
        <Link href="/customers" className="text-sm text-[var(--ob-primary)]">
          Back
        </Link>
      }
    >
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      <Card className="mb-6 p-4">
        <h2 className="font-semibold">Edit customer</h2>
        <div className="mt-3">
          <CustomerEditor customer={customer} />
        </div>
      </Card>
      <h2 className="mb-3 text-sm font-semibold">Orders</h2>
      <CustomerOrdersTable
        orders={orders}
        currencyCode={ws.settings.currency_code}
        orderNumberColumn={ws.profile.ordersNumberColumn}
      />
    </PageShell>
  );
}
