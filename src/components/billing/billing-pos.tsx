"use client";

import { useMemo, useState } from "react";
import type { Customer, Product } from "@/types/database";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type CartLine = {
  product: Product;
  quantity: number;
};

export function groupCategories(products: Product[]): string[] {
  const set = new Set<string>();
  products.forEach((p) => set.add(p.category ?? "Uncategorized"));
  return ["All", ...Array.from(set).sort()];
}

function lineTotal(line: CartLine) {
  return line.quantity * line.product.price;
}

export function BillingPos({
  products,
  customers,
  currencyCode,
  taxRatePercent = 0,
  readOnly,
  onSubmitOrder,
}: {
  products: Product[];
  customers: Customer[];
  currencyCode: string;
  taxRatePercent?: number;
  readOnly?: boolean;
  onSubmitOrder?: (payload: {
    lines: { productId: string; quantity: number }[];
    customerId: string | null;
    notes: string;
    offerCode: string;
    paymentMethod: string;
  }) => Promise<{ ok: boolean; message: string; orderNumber?: string }>;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let rows = products.filter((p) => p.is_active);
    if (category !== "All") {
      rows = rows.filter(
        (p) => (p.category ?? "Uncategorized") === category,
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [products, category, search]);

  const categories = useMemo(() => groupCategories(products), [products]);

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  const tax = subtotal * (taxRatePercent / 100);
  const grandTotal = subtotal + tax;

  function addProduct(product: Product) {
    if (readOnly) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function setQty(productId: string, quantity: number) {
    if (readOnly) return;
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  }

  async function handleSubmit() {
    if (readOnly || !onSubmitOrder) {
      setFeedback("Demo mode — changes are disabled.");
      return;
    }
    if (!cart.length) {
      setFeedback("Add at least one item to the bill.");
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const result = await onSubmitOrder({
      lines: cart.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
      })),
      customerId: customerId || null,
      notes,
      offerCode,
      paymentMethod,
    });
    setSubmitting(false);
    if (result.ok) {
      setCart([]);
      setFeedback(`Order ${result.orderNumber} saved.`);
    } else {
      setFeedback(result.message);
    }
  }

  const cartPanel = (
    <Card className="flex h-full flex-col">
      <h2 className="text-base font-semibold">Current bill</h2>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {cart.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Add items from the catalogue.
          </p>
        ) : (
          cart.map((line) => (
            <div
              key={line.product.id}
              className="flex gap-2 border-b border-[var(--ob-border)] pb-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{line.product.name}</p>
                <p className="text-xs text-[var(--ob-text-muted)]">
                  {formatMoney(line.product.price, currencyCode)} ·{" "}
                  {line.product.unit ?? "unit"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-8 w-8 rounded border border-[var(--ob-border)]"
                  onClick={() => setQty(line.product.id, line.quantity - 1)}
                  disabled={readOnly}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  className="w-14 ob-input py-1 text-center"
                  value={line.quantity}
                  onChange={(e) =>
                    setQty(line.product.id, Number(e.target.value) || 0)
                  }
                  disabled={readOnly}
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  className="h-8 w-8 rounded border border-[var(--ob-border)]"
                  onClick={() => setQty(line.product.id, line.quantity + 1)}
                  disabled={readOnly}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <p className="w-20 text-right font-medium">
                {formatMoney(lineTotal(line), currencyCode)}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 space-y-2 border-t border-[var(--ob-border)] pt-4 text-sm">
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Customer
          </span>
          <select
            className="mt-1 w-full ob-input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={readOnly}
          >
            <option value="">Walk-in</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Offer code
          </span>
          <Input
            value={offerCode}
            onChange={(e) => setOfferCode(e.target.value)}
            disabled={readOnly}
            placeholder="Optional"
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Notes
          </span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={readOnly}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Payment method
          </span>
          <select
            className="mt-1 w-full ob-input"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            disabled={readOnly}
          >
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Cash">Cash</option>
          </select>
        </label>
        <div className="flex justify-between pt-2">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal, currencyCode)}</span>
        </div>
        <div className="flex justify-between text-[var(--ob-text-muted)]">
          <span>Tax ({taxRatePercent}%)</span>
          <span>{formatMoney(tax, currencyCode)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formatMoney(grandTotal, currencyCode)}</span>
        </div>
        {feedback ? (
          <p className="text-sm text-[var(--ob-text-secondary)]" role="status">
            {feedback}
          </p>
        ) : null}
        <Button
          className="w-full"
          onClick={handleSubmit}
          loading={submitting}
          disabled={readOnly}
        >
          Confirm & save order
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 space-y-4 lg:w-[68%]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                category === cat
                  ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white"
                  : "border-[var(--ob-border)] bg-[var(--ob-surface)] hover:bg-[var(--ob-surface-muted)]",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="ob-card flex flex-col items-start p-4 text-left transition hover:border-[var(--ob-border-strong)]"
            >
              <p className="font-medium">{product.name}</p>
              {product.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--ob-text-muted)]">
                  {product.description}
                </p>
              ) : null}
              <p className="mt-3 text-sm font-semibold text-[var(--ob-primary)]">
                {formatMoney(product.price, currencyCode)}
              </p>
            </button>
          ))}
        </div>
      </section>

      <div className="hidden w-full lg:block lg:w-[32%] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
        {cartPanel}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ob-border)] bg-[var(--ob-surface)] p-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--ob-text-muted)]">
              {cart.length} items
            </p>
            <p className="font-semibold">
              {formatMoney(grandTotal, currencyCode)}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setMobileCartOpen(true)}>
            View bill
          </Button>
        </div>
      </div>

      {mobileCartOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close bill"
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--ob-bg)] p-4">
            {cartPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
