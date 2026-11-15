import { findDemoOrderByPublicToken } from "@/lib/demo/public-quote";
import { acceptPublicQuoteAction } from "@/services/quote-actions";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const demoMatch = await findDemoOrderByPublicToken(token);
  const order = demoMatch?.order;
  const brandName = demoMatch?.brandName ?? "Business";

  if (!order) {
    return (
      <main className="ob-workspace mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <p className="ob-label">OrderBook</p>
        <p className="mt-2 font-display text-[26px] font-semibold">
          Quotation not found
        </p>
        <p className="mt-2 text-[15px] text-[var(--ob-text-muted)]">
          This link may have expired or already been accepted.
        </p>
      </main>
    );
  }

  async function accept() {
    "use server";
    await acceptPublicQuoteAction(token);
  }

  const canAccept = order.status === "draft";

  return (
    <main className="ob-workspace mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="ob-card ob-glare p-7">
        <p className="ob-sec-label">{brandName}</p>
        <p className="ob-label-quiet mt-6">Quotation {order.order_number}</p>
        <p className="ob-num mt-1 text-[clamp(38px,11vw,60px)] leading-none">
          {formatMoney(order.grand_total, "INR")}
        </p>
        <p className="ob-fineprint mt-2">Status: {order.status}</p>
        {canAccept ? (
          <form action={accept} className="mt-8">
            <Button type="submit" className="w-full">
              Accept quotation
            </Button>
          </form>
        ) : order.status !== "draft" ? (
          <p className="mt-8 text-[15px] font-semibold text-[var(--ob-success)]">
            This quotation has already been accepted.
          </p>
        ) : null}
      </div>
    </main>
  );
}
