import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { getDemoOrder, getDemoOrderItems } from "@/lib/demo/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const order = getDemoOrder(orderId);
    if (!order) notFound();
    const items = getDemoOrderItems(order.id);

    return (
      <PageShell
        title={`Order ${order.order_number}`}
        headerActions={
          <Link href="/orders" className="text-sm text-[var(--ob-primary)]">
            Back
          </Link>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm text-[var(--ob-text-muted)]">Customer</p>
            <p className="font-medium">
              {order.customer_name_snapshot ?? "Walk-in"}
            </p>
            <p className="mt-4 text-sm text-[var(--ob-text-muted)]">Created</p>
            <p>{formatDate(order.created_at)}</p>
          </Card>
          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>
                  {formatMoney(order.subtotal, ws.settings.currency_code)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>
                  {formatMoney(order.grand_total, ws.settings.currency_code)}
                </span>
              </div>
            </div>
          </Card>
        </div>
        <Card className="mt-4">
          <h2 className="font-semibold">Items</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between border-b pb-2">
                <span>
                  {item.product_name_snapshot} × {item.quantity}
                </span>
                <span>
                  {formatMoney(item.line_total, ws.settings.currency_code)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("brand_id", ws.brand.id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  return (
    <PageShell
      title={`Order ${order.order_number}`}
      headerActions={
        <Link href="/orders" className="text-sm text-[var(--ob-primary)]">
          Back
        </Link>
      }
    >
      <Card>
        <p className="text-sm text-[var(--ob-text-muted)]">
          {formatDate(order.created_at)}
        </p>
        <p className="mt-2 text-xl font-semibold">
          {formatMoney(order.grand_total, ws.settings.currency_code)}
        </p>
      </Card>
      <Card className="mt-4">
        <h2 className="font-semibold">Line items</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between">
              <span>
                {item.product_name_snapshot} × {item.quantity}
              </span>
              <span>
                {formatMoney(item.line_total, ws.settings.currency_code)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
