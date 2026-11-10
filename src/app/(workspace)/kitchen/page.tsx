import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { listOrders } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { isPendingOrder } from "@/lib/orders/order-rules";
import { redirect } from "next/navigation";

export default async function KitchenPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const orders =
    ws.mode === "demo"
      ? (await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code))).filter(
          (o) =>
            isPendingOrder(o) || o.status === "confirmed" || o.status === "draft",
        )
      : (
          await listOrders({
            page: 1,
            pageSize: 50,
            status: "confirmed",
          })
        ).data;

  return (
    <PageShell
      title="Kitchen board"
      headerActions={
        <Link href="/billing" className="text-sm text-[var(--ob-primary)]">
          New order
        </Link>
      }
    >
      <p className="mb-4 text-sm text-[var(--ob-text-muted)]">
        Open tickets — confirm orders from the order detail page to show them here.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="ob-card block p-4 transition hover:border-[var(--ob-primary)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{order.order_number}</p>
              <Badge tone="warning">{order.status}</Badge>
            </div>
            <p className="mt-1 text-sm">
              {order.customer_name_snapshot ?? "Walk-in"}
              {order.table_tag ? ` · Table ${order.table_tag}` : ""}
            </p>
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              {formatDate(order.created_at)} ·{" "}
              {formatMoney(order.grand_total, ws.settings.currency_code)}
            </p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
