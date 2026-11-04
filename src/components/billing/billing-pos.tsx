"use client";

import { useMemo, useState } from "react";
import type { Customer, Product } from "@/types/database";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { Plus } from "lucide-react";

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
  onSubmitOrder,
}: {
  products: Product[];
  customers: Customer[];
  currencyCode: string;
  taxRatePercent?: number;
  onSubmitOrder: (payload: {
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
  const [flashProductId, setFlashProductId] = useState<string | null>(null);

  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((l) => map.set(l.product.id, l.quantity));
    return map;
  }, [cart]);

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
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  function addProduct(product: Product) {
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
    setFlashProductId(product.id);
    window.setTimeout(() => setFlashProductId(null), 450);
    setFeedback(null);
  }

  function setQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
  }

  async function handleSubmit() {
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
      setFeedback(
        result.orderNumber
          ? `Bill ${result.orderNumber} saved successfully.`
          : "Bill saved successfully.",
      );
    } else {
      setFeedback(result.message);
    }
  }

  const cartPanel = (
    <Card className="flex h-full flex-col shadow-[var(--ob-shadow-md)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Current bill</h2>
        {itemCount > 0 ? (
          <span className="rounded-full bg-[var(--ob-primary)] px-2.5 py-0.5 text-xs font-medium text-white">
            {itemCount} items
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {cart.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Tap <strong>Add to bill</strong> on menu items to build the order.
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
                  className="h-8 w-8 rounded border border-[var(--ob-border)] hover:bg-[var(--ob-surface-muted)]"
                  onClick={() => setQty(line.product.id, line.quantity - 1)}
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
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  className="h-8 w-8 rounded border border-[var(--ob-border)] hover:bg-[var(--ob-surface-muted)]"
                  onClick={() => setQty(line.product.id, line.quantity + 1)}
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
          <p
            className={cn(
              "text-sm",
              feedback.includes("saved")
                ? "text-[var(--ob-success)]"
                : "text-[var(--ob-text-secondary)]",
            )}
            role="status"
          >
            {feedback}
          </p>
        ) : null}
        <Button
          className="w-full"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!cart.length}
        >
          Confirm & save order
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="relative flex flex-col gap-4 pb-24 lg:flex-row lg:items-start lg:pb-0">
      <section className="min-w-0 flex-1 space-y-4 lg:w-[68%]">
        <Input
          placeholder="Search menu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const inCart = cartQtyByProduct.get(product.id) ?? 0;
            const flashing = flashProductId === product.id;
            return (
              <div
                key={product.id}
                className={cn(
                  "ob-card flex flex-col p-4 transition",
                  flashing && "ring-2 ring-[var(--ob-accent)] ring-offset-2",
                  inCart > 0 && "border-[var(--ob-primary)]",
                )}
              >
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{product.name}</p>
                    {inCart > 0 ? (
                      <span className="shrink-0 rounded-full bg-[var(--ob-surface-muted)] px-2 py-0.5 text-xs font-medium">
                        ×{inCart}
                      </span>
                    ) : null}
                  </div>
                  {product.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--ob-text-muted)]">
                      {product.description}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm font-semibold text-[var(--ob-primary)]">
                    {formatMoney(product.price, currencyCode)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={inCart > 0 ? "secondary" : "primary"}
                  className="mt-4 w-full"
                  onClick={() => addProduct(product)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {inCart > 0 ? "Add another" : "Add to bill"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="hidden w-full lg:block lg:w-[32%] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
        {cartPanel}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ob-border)] bg-[var(--ob-surface)] p-3 shadow-[var(--ob-shadow-md)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--ob-text-muted)]">
              {itemCount} items in bill
            </p>
            <p className="text-lg font-semibold">
              {formatMoney(grandTotal, currencyCode)}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setMobileCartOpen(true)}>
            Open bill
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
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-[var(--ob-bg)] p-4">
            {cartPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
