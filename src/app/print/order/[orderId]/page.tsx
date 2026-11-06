import { getDemoOrder, getDemoOrderItems, toDemoBrandCode } from "@/lib/demo/data";
import { buildBillDocumentFromOrder } from "@/lib/documents/build-bill-document";
import { formatBillText } from "@/lib/documents/format-bill-text";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AutoPrint } from "@/components/print/auto-print";
import { notFound, redirect } from "next/navigation";

export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const docMeta = {
    brandName: ws.brand.name,
    receiptHeader: ws.settings.receipt_header ?? ws.brand.name,
    receiptFooter: ws.settings.receipt_footer ?? null,
    currencyCode: ws.settings.currency_code,
    taxRatePercent: ws.settings.tax_rate_percent ?? 0,
  };

  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const order = await getDemoOrder(orderId, code);
    if (!order) notFound();
    const items = await getDemoOrderItems(order.id, code);
    const document = buildBillDocumentFromOrder({ order, items, ...docMeta });
    const text = formatBillText(document);
    return (
      <main className="mx-auto max-w-md p-6 font-mono text-sm whitespace-pre-wrap print:p-4">
        <AutoPrint />
        <pre>{text}</pre>
      </main>
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
  const document = buildBillDocumentFromOrder({
    order: order as import("@/types/database").Order,
    items: (items ?? []) as import("@/types/database").OrderItem[],
    ...docMeta,
  });
  const text = formatBillText(document);
  return (
    <main className="mx-auto max-w-md p-6 font-mono text-sm whitespace-pre-wrap print:p-4">
      <AutoPrint />
      <pre>{text}</pre>
    </main>
  );
}
