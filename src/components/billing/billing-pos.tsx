"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer, OrderDiscountInput, Offer, Product, BrandRole } from "@/types/database";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { normalizeCustomerPhone } from "@/lib/security/input";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { PosProductTileWithButton } from "@/components/billing/pos-product-tile";
import { ProductPeekDialog } from "@/components/billing/product-peek-dialog";
import {
  computeCartTotals,
  parseOptionalOrderDiscount,
} from "@/lib/pricing/discounts";
import {
  computeOfferDiscountAmount,
  findActiveOffer,
  validateOfferCodeForCart,
} from "@/lib/pricing/offers";
import {
  cartLineDiscountAmount,
  cartLineKey,
  cartLineNetTotal,
  isLowStock,
  pricedProductForCartLine,
  stockAvailable,
} from "@/lib/pricing/cart-line";
import { customerPriceTier } from "@/lib/pricing/unit-price";
import { parseProductModifiers } from "@/lib/products/modifiers";
import { validateManualOrderDiscountForRole } from "@/lib/security/discount-policy";
import {
  RETAIL_BILLING_COPY,
  formatBillingSavedMessage,
  type BillingDocumentMode,
  type BillingPosCopy,
} from "@/lib/workspace/constants";
import type { CartLine } from "@/components/billing/types";
import { OrderDocumentActions } from "@/components/billing/order-document-actions";
import { buildBillDocumentFromCheckout } from "@/lib/documents/build-bill-document";
import type { BillDocument } from "@/lib/documents/types";
import {
  categoryLabel,
  categoryTint,
  groupCategories,
  groupProductsByCategory,
} from "@/lib/products/catalog-groups";
import type { BrandSettings } from "@/types/database";

export type BillBrandSettings = Pick<
  BrandSettings,
  "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
>;

export type { CartLine } from "@/components/billing/types";

function lineTotal(
  line: CartLine,
  tier: ReturnType<typeof customerPriceTier>,
) {
  return cartLineNetTotal(line.product, line.quantity, tier, line.modifierIds);
}

export function BillingPos({
  products,
  customers,
  currencyCode,
  taxRatePercent = 0,
  copy = RETAIL_BILLING_COPY,
  documentMode = "retail",
  brandName,
  brandCode,
  brandSettings,
  receiptHeader,
  receiptFooter,
  offers = [],
  userRole = "owner",
  blockOversell = false,
  onSubmitOrder,
}: {
  products: Product[];
  customers: Customer[];
  currencyCode: string;
  taxRatePercent?: number;
  copy?: BillingPosCopy;
  documentMode?: BillingDocumentMode;
  brandName: string;
  brandCode?: string;
  brandSettings?: BillBrandSettings;
  receiptHeader: string;
  receiptFooter: string | null;
  offers?: Offer[];
  userRole?: BrandRole;
  blockOversell?: boolean;
  onSubmitOrder: (payload: {
    lines: {
      productId: string;
      quantity: number;
      lineDiscount: number;
      modifierIds?: string[];
    }[];
    customerId: string | null;
    customerPhone: string | null;
    walkInName?: string;
    notes: string;
    offerCode: string;
    paymentMethod: string;
    saveAsQuote: boolean;
    orderDiscount: OrderDiscountInput | null;
    tableTag?: string;
    deliveryNotes?: string;
    depositPercent?: number | null;
    saveNewCustomer?: boolean;
  }) => Promise<{
    ok: boolean;
    message: string;
    orderNumber?: string;
    savedAsQuote?: boolean;
  }>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [saveAsQuote, setSaveAsQuote] = useState(false);
  const [orderDiscountType, setOrderDiscountType] = useState<
    "none" | "percent" | "fixed"
  >("none");
  const [orderDiscountValue, setOrderDiscountValue] = useState("");
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [tableTag, setTableTag] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [depositPercent, setDepositPercent] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [flashProductId, setFlashProductId] = useState<string | null>(null);
  const [lastSavedDocument, setLastSavedDocument] = useState<BillDocument | null>(
    null,
  );
  const [modifierPick, setModifierPick] = useState<{
    product: Product;
    ids: string[];
  } | null>(null);
  const [peekProduct, setPeekProduct] = useState<Product | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );
  const priceTier = customerPriceTier(selectedCustomer);

  const pricedCart = useMemo(
    () =>
      cart.map((line) => ({
        product: pricedProductForCartLine(
          line.product,
          priceTier,
          line.modifierIds,
        ),
        quantity: line.quantity,
      })),
    [cart, priceTier],
  );

  const dedicatedFlow =
    documentMode === "quotation" || documentMode === "bill";
  const savingAsQuote =
    documentMode === "quotation"
      ? true
      : documentMode === "bill"
        ? false
        : Boolean(saveAsQuote);
  const cartTitle =
    documentMode === "quotation"
      ? (copy.quotationCartTitle ?? "Quotation")
      : documentMode === "bill"
        ? (copy.billCartTitle ?? copy.cartTitle)
        : copy.cartTitle;
  const modeHint =
    documentMode === "quotation"
      ? copy.quotationModeHint
      : documentMode === "bill"
        ? copy.billModeHint
        : null;
  const showLineImages = documentMode === "quotation";
  const confirmLabel = savingAsQuote ? copy.confirmQuoteButton : copy.confirmButton;

  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((l) => {
      map.set(l.product.id, (map.get(l.product.id) ?? 0) + l.quantity);
    });
    return map;
  }, [cart]);

  const filtered = useMemo(() => {
    let rows = products.filter((p) => p.is_active);
    if (category !== "All") {
      rows = rows.filter((p) => categoryLabel(p) === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false) ||
          (p.sku?.toLowerCase() === q) ||
          (p.sku?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [products, category, search]);

  const categories = useMemo(() => groupCategories(products), [products]);

  const parsedOrderDiscount = useMemo(
    () => parseOptionalOrderDiscount(orderDiscountType, orderDiscountValue),
    [orderDiscountType, orderDiscountValue],
  );

  const totals = useMemo(() => {
    const orderDiscount =
      parsedOrderDiscount.ok && parsedOrderDiscount.discount
        ? parsedOrderDiscount.discount
        : null;
    const pre = computeCartTotals({
      lines: pricedCart,
      taxRatePercent,
      orderDiscount,
    });
    let offerDiscountAmount = 0;
    if (offerCode.trim() && offers.length) {
      const active = findActiveOffer(offerCode, offers);
      if (active) {
        offerDiscountAmount = computeOfferDiscountAmount(active, {
          lines: pricedCart,
          subtotalAfterProductDiscounts:
            pre.subtotalAfterProductDiscounts - pre.orderDiscountAmount,
        });
      }
    }
    return computeCartTotals({
      lines: pricedCart,
      taxRatePercent,
      orderDiscount,
      offerDiscountAmount,
    });
  }, [pricedCart, taxRatePercent, parsedOrderDiscount, offerCode, offers]);

  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  function stockBlockMessage(product: Product, addQty: number): string | null {
    const inCart = cartQtyByProduct.get(product.id) ?? 0;
    const available = stockAvailable(product);
    if (blockOversell && available != null && available <= 0) {
      return `${product.name} is out of stock.`;
    }
    if (available != null && inCart + addQty > available) {
      return `Only ${available} in stock for ${product.name}.`;
    }
    return null;
  }

  function addProductToCart(product: Product, modifierIds: string[]) {
    const block = stockBlockMessage(product, 1);
    if (block) {
      setFeedback(block);
      return;
    }
    const key = cartLineKey(product.id, modifierIds);
    setCart((prev) => {
      const existing = prev.find(
        (l) => cartLineKey(l.product.id, l.modifierIds) === key,
      );
      if (existing) {
        return prev.map((l) =>
          cartLineKey(l.product.id, l.modifierIds) === key
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { product, quantity: 1, modifierIds }];
    });
    setFlashProductId(product.id);
    window.setTimeout(() => setFlashProductId(null), 450);
    setFeedback(null);
    setLastSavedDocument(null);
  }

  function tryAddProduct(product: Product) {
    const mods = parseProductModifiers(product);
    if (mods.length) {
      setModifierPick({ product, ids: [] });
      return;
    }
    addProductToCart(product, []);
  }

  function setQty(productId: string, quantity: number, modifierIds: string[]) {
    setLastSavedDocument(null);
    const key = cartLineKey(productId, modifierIds);
    if (quantity <= 0) {
      setCart((prev) =>
        prev.filter((l) => cartLineKey(l.product.id, l.modifierIds) !== key),
      );
      return;
    }
    const product = cart.find((l) => cartLineKey(l.product.id, l.modifierIds) === key)
      ?.product;
    if (product) {
      const inCartOthers =
        (cartQtyByProduct.get(productId) ?? 0) -
        (cart.find((l) => cartLineKey(l.product.id, l.modifierIds) === key)
          ?.quantity ?? 0);
      const available = stockAvailable(product);
      if (available != null && inCartOthers + quantity > available) {
        setFeedback(`Only ${available} in stock for ${product.name}.`);
        return;
      }
    }
    setCart((prev) =>
      prev.map((l) =>
        cartLineKey(l.product.id, l.modifierIds) === key
          ? { ...l, quantity }
          : l,
      ),
    );
  }

  async function handleSubmit(asQuote: boolean) {
    if (!cart.length) {
      setFeedback("Add at least one item to the bill.");
      return;
    }
    const phone = normalizeCustomerPhone(customerMobile);
    if (customerMobile.trim() && !phone) {
      setFeedback("Enter a valid mobile number (8–15 digits).");
      return;
    }
    const trimmedWalkInName = customerName.trim();
    if (trimmedWalkInName.length > 120) {
      setFeedback("Customer name is too long.");
      return;
    }
    if (!parsedOrderDiscount.ok) {
      setFeedback(parsedOrderDiscount.message);
      return;
    }
    const roleCheck = validateManualOrderDiscountForRole(
      userRole,
      parsedOrderDiscount.discount,
    );
    if (!roleCheck.ok) {
      setFeedback(roleCheck.message);
      return;
    }
    if (offerCode.trim()) {
      const offerCheck = validateOfferCodeForCart(
        offerCode,
        offers,
        pricedCart,
        totals.subtotalAfterProductDiscounts - totals.orderDiscountAmount,
      );
      if (!offerCheck.ok) {
        setFeedback(offerCheck.message);
        return;
      }
    }
    const deposit =
      depositPercent.trim() === ""
        ? null
        : Number(depositPercent);
    if (deposit != null && (!Number.isFinite(deposit) || deposit < 0 || deposit > 100)) {
      setFeedback("Deposit must be between 0 and 100.");
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const result = await onSubmitOrder({
      lines: cart.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        lineDiscount: cartLineDiscountAmount(
          l.product,
          l.quantity,
          priceTier,
          l.modifierIds,
        ),
        modifierIds: l.modifierIds.length ? l.modifierIds : undefined,
      })),
      customerId: customerId || null,
      customerPhone: phone,
      walkInName: customerId ? undefined : trimmedWalkInName || undefined,
      notes,
      offerCode,
      paymentMethod,
      saveAsQuote: asQuote,
      orderDiscount: parsedOrderDiscount.discount,
      tableTag: tableTag.trim() || undefined,
      deliveryNotes: deliveryNotes.trim() || undefined,
      depositPercent: deposit,
      saveNewCustomer: saveNewCustomer && !customerId,
    });
    setSubmitting(false);
    if (result.ok) {
      router.refresh();
      const isQuote = result.savedAsQuote ?? asQuote;
      const resolvedCustomerName = customerId
        ? (customers.find((c) => c.id === customerId)?.name ?? null)
        : trimmedWalkInName || null;
      if (result.orderNumber) {
        setLastSavedDocument(
          buildBillDocumentFromCheckout({
            orderNumber: result.orderNumber,
            isQuote,
            brandName,
            brandCode,
            brandSettings,
            receiptHeader,
            receiptFooter,
            currencyCode,
            taxRatePercent,
            customerName: resolvedCustomerName,
            customerPhone: phone,
            notes,
            paymentMethod,
            cart,
            totals,
          }),
        );
      }
      const isQuoteAfter = result.savedAsQuote ?? asQuote;
      if (result.orderNumber) {
        setFeedback(
          isQuoteAfter
            ? formatBillingSavedMessage(
                copy.savedQuoteMessage,
                result.orderNumber,
              )
            : formatBillingSavedMessage(
                copy.savedBillMessage,
                result.orderNumber,
              ),
        );
      } else {
        setFeedback(isQuoteAfter ? "Quotation saved." : "Bill saved successfully.");
      }
    } else {
      setFeedback(result.message);
    }
  }

  const cartPanel = (
    <Card className="flex h-full flex-col shadow-[var(--ob-shadow-md)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{cartTitle}</h2>
        {itemCount > 0 ? (
          <span className="rounded-full bg-[var(--ob-primary)] px-2.5 py-0.5 text-xs font-medium text-white">
            {itemCount} items
          </span>
        ) : null}
      </div>
      {modeHint ? (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">{modeHint}</p>
      ) : null}
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {cart.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            {copy.emptyCartHint}
          </p>
        ) : (
          cart.map((line) => (
            <div
              key={cartLineKey(line.product.id, line.modifierIds)}
              className="flex gap-2 border-b border-[var(--ob-border)] pb-3 text-sm"
            >
              {showLineImages ? (
                <ProductThumbnail
                  name={line.product.name}
                  imageUrl={line.product.image_url}
                  size="sm"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">{line.product.name}</p>
                  <p className="shrink-0 font-medium">
                    {formatMoney(lineTotal(line, priceTier), currencyCode)}
                  </p>
                </div>
                {line.modifierIds.length ? (
                  <p className="text-xs text-[var(--ob-text-muted)]">
                    {parseProductModifiers(line.product)
                      .filter((m) => line.modifierIds.includes(m.id))
                      .map((m) => m.name)
                      .join(", ")}
                  </p>
                ) : null}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <ProductPrice
                      product={pricedProductForCartLine(
                        line.product,
                        priceTier,
                        line.modifierIds,
                      )}
                      currencyCode={currencyCode}
                      size="sm"
                    />
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {line.product.unit ?? "unit"} · qty {line.quantity}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="ob-touch-target flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[var(--ob-border)] hover:bg-[var(--ob-surface-muted)]"
                      onClick={() =>
                        setQty(
                          line.product.id,
                          line.quantity - 1,
                          line.modifierIds,
                        )
                      }
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      className="ob-input py-2 text-center"
                      style={{ width: "3.5rem" }}
                      value={line.quantity}
                      onChange={(e) =>
                        setQty(
                          line.product.id,
                          Number(e.target.value) || 0,
                          line.modifierIds,
                        )
                      }
                      aria-label="Quantity"
                    />
                    <button
                      type="button"
                      className="ob-touch-target flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[var(--ob-border)] hover:bg-[var(--ob-surface-muted)]"
                      onClick={() =>
                        setQty(
                          line.product.id,
                          line.quantity + 1,
                          line.modifierIds,
                        )
                      }
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 space-y-2 border-t border-[var(--ob-border)] pt-4 text-sm">
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Customer name <span className="font-normal">(optional)</span>
          </span>
          <Input
            type="text"
            autoComplete="name"
            value={customerName}
            disabled={Boolean(customerId)}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setLastSavedDocument(null);
            }}
            placeholder="Walk-in guest name"
            className="mt-1"
          />
          {customerId ? (
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Name comes from the saved customer below.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Shown in ALL CAPS on the WhatsApp bill message when set.
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Mobile number
          </span>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={customerMobile}
            onChange={(e) => {
              setCustomerMobile(e.target.value);
              setLastSavedDocument(null);
              if (e.target.value.trim() && customerId) {
                setCustomerId("");
              }
            }}
            placeholder="e.g. 9876543210"
            className="mt-1"
            aria-describedby="billing-mobile-hint"
          />
          <span
            id="billing-mobile-hint"
            className="mt-1 block text-xs text-[var(--ob-text-muted)]"
          >
            For walk-in orders — saved on the bill without picking a customer.
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Saved customer <span className="font-normal">(optional)</span>
          </span>
          <select
            className="mt-1 w-full ob-input"
            value={customerId}
            onChange={(e) => {
              const id = e.target.value;
              setCustomerId(id);
              setLastSavedDocument(null);
              const picked = customers.find((c) => c.id === id);
              if (picked) {
                setCustomerName(picked.name);
                if (picked.phone) {
                  setCustomerMobile(picked.phone);
                }
              } else {
                setCustomerName("");
              }
            }}
          >
            <option value="">None — use mobile above</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
        {documentMode === "retail" ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              Table / tag
            </span>
            <Input
              value={tableTag}
              onChange={(e) => setTableTag(e.target.value)}
              placeholder="e.g. T12"
              className="mt-1"
            />
          </label>
        ) : null}
        {dedicatedFlow ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              Delivery / site notes
            </span>
            <Input
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Floor, installation, access…"
              className="mt-1"
            />
          </label>
        ) : null}
        {savingAsQuote ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              Deposit % (optional)
            </span>
            <Input
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              placeholder="e.g. 30"
              className="mt-1"
            />
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveNewCustomer}
            onChange={(e) => setSaveNewCustomer(e.target.checked)}
            disabled={Boolean(customerId)}
          />
          Save walk-in as new customer
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
        <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
            Order discount <span className="font-normal normal-case">(optional)</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="ob-input min-w-[8rem] flex-1"
              value={orderDiscountType}
              onChange={(e) =>
                setOrderDiscountType(
                  e.target.value as "none" | "percent" | "fixed",
                )
              }
              aria-label="Order discount type"
            >
              <option value="none">None</option>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
            {orderDiscountType !== "none" ? (
              <Input
                type="number"
                min={0}
                max={orderDiscountType === "percent" ? 100 : undefined}
                step="0.01"
                value={orderDiscountValue}
                onChange={(e) => setOrderDiscountValue(e.target.value)}
                placeholder={
                  orderDiscountType === "percent" ? "e.g. 10" : "Amount"
                }
                className="min-w-[6rem] flex-1"
                aria-label="Order discount value"
              />
            ) : null}
          </div>
          {!parsedOrderDiscount.ok ? (
            <p className="mt-2 text-xs text-[var(--ob-danger)]">
              {parsedOrderDiscount.message}
            </p>
          ) : null}
        </div>
        {!savingAsQuote ? (
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
        ) : null}
        <div className="flex justify-between pt-2">
          <span>List subtotal</span>
          <span>{formatMoney(totals.listSubtotal, currencyCode)}</span>
        </div>
        {totals.productDiscountTotal > 0 ? (
          <div className="flex justify-between text-[var(--ob-success)]">
            <span>Product discounts</span>
            <span>−{formatMoney(totals.productDiscountTotal, currencyCode)}</span>
          </div>
        ) : null}
        {totals.orderDiscountAmount > 0 ? (
          <div className="flex justify-between text-[var(--ob-success)]">
            <span>Order discount</span>
            <span>−{formatMoney(totals.orderDiscountAmount, currencyCode)}</span>
          </div>
        ) : null}
        {totals.offerDiscountAmount > 0 ? (
          <div className="flex justify-between text-[var(--ob-success)]">
            <span>Offer discount</span>
            <span>−{formatMoney(totals.offerDiscountAmount, currencyCode)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span>{formatMoney(totals.taxableSubtotal, currencyCode)}</span>
        </div>
        <div className="flex justify-between text-[var(--ob-text-muted)]">
          <span>Tax ({taxRatePercent}%)</span>
          <span>{formatMoney(totals.taxTotal, currencyCode)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>{savingAsQuote ? "Quotation total" : "Total"}</span>
          <span>{formatMoney(totals.grandTotal, currencyCode)}</span>
        </div>
        {documentMode === "retail" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveAsQuote}
              onChange={(e) => setSaveAsQuote(e.target.checked)}
            />
            {copy.saveAsQuoteLabel}
          </label>
        ) : null}
        {feedback ? (
          <p
            className={cn(
              "text-sm",
              feedback.includes("saved to Orders") || feedback.includes("saved successfully")
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
          onClick={() => handleSubmit(savingAsQuote)}
          loading={submitting}
          disabled={!cart.length}
        >
          {confirmLabel}
        </Button>
        {lastSavedDocument ? (
          <OrderDocumentActions
            document={lastSavedDocument}
            compact
            onDismiss={() => setLastSavedDocument(null)}
          />
        ) : null}
      </div>
    </Card>
  );

  const productTile = (product: Product) => {
    const inCart = cartQtyByProduct.get(product.id) ?? 0;
    const flashing = flashProductId === product.id;
    const available = stockAvailable(product);
    const stockLabel = available != null ? `Stock ${available}` : null;
    const displayProduct = pricedProductForCartLine(product, priceTier, []);
    return (
      <PosProductTileWithButton
        key={product.id}
        product={displayProduct}
        currencyCode={currencyCode}
        inCartQty={inCart}
        flashing={flashing}
        addLabel={copy.addButton}
        addAnotherLabel={copy.addAnotherButton}
        stockLabel={stockLabel}
        lowStock={isLowStock(product)}
        onAdd={() => tryAddProduct(product)}
        onPeek={() => setPeekProduct(displayProduct)}
      />
    );
  };

  const gridClass = "ob-stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";
  const allItemsGridClass =
    "ob-stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

  const catalogSection = (
      <section className="min-w-0 flex-1 space-y-4 lg:w-[68%] xl:w-[72%]">
        <Input
          placeholder={copy.searchPlaceholder}
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
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition",
                category === cat
                  ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white"
                  : "border-[var(--ob-border)] bg-[var(--ob-surface)] hover:bg-[var(--ob-surface-muted)]",
              )}
            >
              {cat !== "All" ? (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: categoryTint(cat).accent }}
                />
              ) : null}
              {cat}
            </button>
          ))}
        </div>
        {category === "All" && !search.trim() ? (
          <div className="space-y-5">
            {groupProductsByCategory(filtered).map((group) => {
              const tint = categoryTint(group.category);
              return (
                <section
                  key={group.category}
                  className="rounded-[var(--ob-radius-lg)] p-3"
                  style={{ backgroundColor: tint.background }}
                >
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: tint.accent }}
                    >
                      {group.category}
                    </h3>
                    <span className="text-xs text-[var(--ob-text-muted)]">
                      {group.products.length}
                    </span>
                  </div>
                  <div className={allItemsGridClass}>
                    {group.products.map(productTile)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={gridClass}>{filtered.map(productTile)}</div>
        )}
      </section>
  );

  const cartAside = (
      <div className="hidden w-full lg:block lg:w-[32%] xl:w-[28%] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
        {cartPanel}
      </div>
  );

  return (
    <div className="relative space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      {modifierPick ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md p-4">
            <h3 className="font-semibold">{modifierPick.product.name}</h3>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Choose add-ons (optional)
            </p>
            <ul className="mt-3 space-y-2">
              {parseProductModifiers(modifierPick.product).map((mod) => {
                const on = modifierPick.ids.includes(mod.id);
                return (
                  <li key={mod.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setModifierPick((prev) => {
                            if (!prev) return prev;
                            const ids = on
                              ? prev.ids.filter((id) => id !== mod.id)
                              : [...prev.ids, mod.id];
                            return { ...prev, ids };
                          });
                        }}
                      />
                      <span className="flex-1">{mod.name}</span>
                      <span className="text-[var(--ob-text-muted)]">
                        +{formatMoney(mod.price, currencyCode)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setModifierPick(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  addProductToCart(modifierPick.product, modifierPick.ids);
                  setModifierPick(null);
                }}
              >
                Add to bill
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      <ProductPeekDialog
        product={peekProduct}
        currencyCode={currencyCode}
        addLabel={copy.addButton}
        onAdd={tryAddProduct}
        onClose={() => setPeekProduct(null)}
      />
      <div
        className={cn(
          "flex flex-col gap-4 lg:flex-row lg:items-start",
          dedicatedFlow && "lg:flex-row-reverse",
        )}
      >
        {catalogSection}
        {cartAside}
      </div>

      <div className="ob-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ob-border)] bg-[var(--ob-surface)] p-3 shadow-[var(--ob-shadow-md)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--ob-text-muted)]">
              {itemCount} items in bill
            </p>
            <p className="text-lg font-semibold">
              {formatMoney(totals.grandTotal, currencyCode)}
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
          <div className="ob-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(90vh,900px)] overflow-y-auto rounded-t-2xl bg-[var(--ob-bg)] p-4 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--ob-border)]" aria-hidden />
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{cartTitle}</p>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                onClick={() => setMobileCartOpen(false)}
              >
                Close
              </Button>
            </div>
            {cartPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
