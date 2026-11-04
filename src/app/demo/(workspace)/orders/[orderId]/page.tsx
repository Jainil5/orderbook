"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { getDemoOrder, getDemoOrderItems } from "@/lib/demo/data";
import { formatDate, formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default function DemoOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const { settings } = useDemoWorkspace();
  const order = getDemoOrder(params.orderId);
  if (!order) notFound();
  const items = getDemoOrderItems(order.id);

  return (
    <DemoPageShell
      title={`Order ${order.order_number}`}
      headerActions={
        <Link href="/demo/orders" className="text-sm text-[var(--ob-primary)]">
          Back
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-sm text-[var(--ob-text-muted)]">Customer</p>
          <p className="font-medium">{order.customer_name_snapshot ?? "Walk-in"}</p>
          <p className="mt-4 text-sm text-[var(--ob-text-muted)]">Created</p>
          <p>{formatDate(order.created_at)}</p>
        </Card>
        <Card>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(order.subtotal, settings.currency_code)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>{formatMoney(order.discount_total, settings.currency_code)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatMoney(order.tax_total, settings.currency_code)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.grand_total, settings.currency_code)}</span>
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
              <span>{formatMoney(item.line_total, settings.currency_code)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </DemoPageShell>
  );
}
