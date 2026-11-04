import Link from "next/link";
import { LivePageShell } from "@/components/workspace/live-page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const ws = await loadLiveWorkspace();
  if (!ws) notFound();

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
    <LivePageShell
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
    </LivePageShell>
  );
}
