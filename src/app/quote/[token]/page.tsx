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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <p className="text-lg font-semibold">Quotation not found</p>
        <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
        {brandName}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">
        Quotation {order.order_number}
      </h1>
      <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
        Total: {formatMoney(order.grand_total, "INR")}
      </p>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Status: {order.status}
      </p>
      {canAccept ? (
        <form action={accept} className="mt-8">
          <Button type="submit" className="w-full">
            Accept quotation
          </Button>
        </form>
      ) : order.status !== "draft" ? (
        <p className="mt-8 text-sm text-[var(--ob-success)]">
          This quotation has already been accepted.
        </p>
      ) : null}
    </main>
  );
}
