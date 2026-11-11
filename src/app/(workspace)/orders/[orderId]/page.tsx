import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { getDemoOrder, getDemoOrderItems, getDemoCustomer, listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import { buildBillDocumentFromOrder, productImageLookupFromProducts } from "@/lib/documents/build-bill-document";
import { OrderDetailDocuments } from "@/components/orders/order-detail-documents";
import { OrderLineItemsList } from "@/components/orders/order-line-items-list";
import { OrderCustomerDetails } from "@/components/orders/order-customer-details";
import { OrderOperationsPanel } from "@/components/orders/order-operations-panel";
import { OrderNotesEditor } from "@/components/orders/order-notes-editor";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { formatMoney } from "@/lib/format";
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

  const docMeta = {
    brandName: ws.brand.name,
    brandCode: ws.brand.code,
    brandSettings: {
      contact_email: ws.settings.contact_email,
      contact_phone: ws.settings.contact_phone,
      brand_website_url: ws.settings.brand_website_url,
      receipt_header: ws.settings.receipt_header,
    },
    receiptHeader: ws.settings.receipt_header ?? ws.brand.name,
    receiptFooter: ws.settings.receipt_footer ?? null,
    currencyCode: ws.settings.currency_code,
    taxRatePercent: ws.settings.tax_rate_percent ?? 0,
  };

  const demoCode = toDemoBrandCode(ws.brand.code);
  const order = await getDemoOrder(orderId, demoCode);
  if (!order) notFound();
  const items = await getDemoOrderItems(order.id, demoCode);
  const products = await listDemoProductsMerged({}, demoCode);
  const productImageByProductId = productImageLookupFromProducts(products);
  const document = buildBillDocumentFromOrder({
    order,
    items,
    productImageByProductId,
    ...docMeta,
  });

  const linkedCustomer = order.customer_id
    ? await getDemoCustomer(order.customer_id, demoCode)
    : null;

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
        <OrderCustomerDetails
          order={order}
          customer={linkedCustomer ?? null}
          customerPhone={linkedCustomer?.phone ?? document.customerPhone}
        />
        <Card>
          <h2 className="font-semibold">Totals</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>
                {formatMoney(order.subtotal, ws.settings.currency_code)}
              </span>
            </div>
            {order.discount_total > 0 ? (
              <div className="flex justify-between text-[var(--ob-success)]">
                <span>Discounts</span>
                <span>
                  −{formatMoney(order.discount_total, ws.settings.currency_code)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-[var(--ob-text-muted)]">
              <span>Tax</span>
              <span>
                {formatMoney(order.tax_total, ws.settings.currency_code)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--ob-border)] pt-2 text-base font-semibold">
              <span>Grand total</span>
              <span>
                {formatMoney(order.grand_total, ws.settings.currency_code)}
              </span>
            </div>
            <p className="text-xs text-[var(--ob-text-muted)]">
              Status: {order.status} · {order.payment_status}
            </p>
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="font-semibold">Items</h2>
        <OrderLineItemsList
          lines={document.lines}
          currencyCode={ws.settings.currency_code}
          showImages={document.kind === "quotation"}
        />
      </Card>
      <OrderDetailDocuments document={document} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <OrderNotesEditor order={order} />
        <OrderOperationsPanel
          order={order}
          currencyCode={ws.settings.currency_code}
          publicQuoteUrl={
            order.public_token ? `/quote/${order.public_token}` : null
          }
        />
      </div>
    </PageShell>
  );
}
