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
import { findCustomerByPhone } from "@/lib/demo/customer-identity";
import { localDayKey } from "@/lib/manager/time";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { PosProductTileWithButton } from "@/components/billing/pos-product-tile";
import { ProductPeekDialog } from "@/components/billing/product-peek-dialog";
import {
  computeCartTotals,
  parseOptionalOrderDiscount,
  roundMoney,
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
  type CaptureMode,
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
  captureMode = "counter",
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
  captureMode?: CaptureMode;
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
    feesTotal?: number | null;
    orderType?: "dine_in" | "takeaway" | "delivery" | "online";
    serviceDate?: string;
    guests?: number | null;
    deliveryAddress?: string;
    paymentReference?: string;
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
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [orderType, setOrderType] = useState<
    "dine_in" | "takeaway" | "delivery" | "online"
  >("dine_in");
  const [serviceDate, setServiceDate] = useState(() => localDayKey(new Date()));
  const [guests, setGuests] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [offerPick, setOfferPick] = useState("");
  const [offerCustom, setOfferCustom] = useState("");
  const offerCode =
    offerPick === "__custom" ? offerCustom.trim() : offerPick;
  const [paymentMethod, setPaymentMethod] = useState("PENDING");
  const [orderDiscountType, setOrderDiscountType] = useState<
    "none" | "percent" | "fixed"
  >("none");
  const [orderDiscountValue, setOrderDiscountValue] = useState("");
  const [tableTag, setTableTag] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [depositPercent, setDepositPercent] = useState("");
  const [feesInput, setFeesInput] = useState("");
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

  const priceTier = customerPriceTier(null);
  const matchedCustomer = useMemo(
    () =>
      customerMobile.trim()
        ? findCustomerByPhone(customers, customerMobile)
        : null,
    [customers, customerMobile],
  );

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
  const isProject = captureMode === "project";
  const projectCopy = copy.projectFields;
  const savingAsQuote = documentMode === "quotation";
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

  const parsedFees = useMemo<{ ok: true; amount: number } | { ok: false; message: string }>(
    () => {
      const raw = feesInput.trim();
      if (!raw) return { ok: true, amount: 0 };
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, message: "Enter a valid charges amount." };
      }
      return { ok: true, amount: roundMoney(value) };
    },
    [feesInput],
  );

  const feesAmount = isProject && parsedFees.ok ? parsedFees.amount : 0;

  const totals = useMemo(() => {
    const orderDiscount =
      parsedOrderDiscount.ok && parsedOrderDiscount.discount
        ? parsedOrderDiscount.discount
        : null;
    const pre = computeCartTotals({
      lines: pricedCart,
      taxRatePercent,
      orderDiscount,
      feesAmount,
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
      feesAmount,
    });
  }, [pricedCart, taxRatePercent, parsedOrderDiscount, offerCode, offers, feesAmount]);

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
    if (product.unavailable) {
      setFeedback("Not available right now.");
      return;
    }
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

  async function handleSubmit() {
    if (!cart.length) {
      setFeedback("Add at least one item to the bill.");
      return;
    }
    const phone = normalizeCustomerPhone(customerMobile);
    if (!phone) {
      setFeedback("Enter the customer mobile number (8–15 digits).");
      return;
    }
    const trimmedWalkInName = customerName.trim();
    if (trimmedWalkInName.length > 120) {
      setFeedback("Customer name is too long.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      setFeedback("Pick a valid date.");
      return;
    }
    if (!isProject && guests.trim()) {
      const g = Number(guests);
      if (!Number.isInteger(g) || g < 1 || g > 99) {
        setFeedback("Guests must be a whole number between 1 and 99.");
        return;
      }
    }
    if (!parsedFees.ok) {
      setFeedback(parsedFees.message);
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
    const asQuote = savingAsQuote;
    const resolvedPaymentMethod =
      asQuote || paymentMethod === "PENDING" ? "" : paymentMethod;
    setSubmitting(true);
    setFeedback(null);
    let result: {
      ok: boolean;
      message: string;
      orderNumber?: string;
      savedAsQuote?: boolean;
    };
    try {
      result = await onSubmitOrder({
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
        customerPhone: phone,
        walkInName: trimmedWalkInName || undefined,
        notes,
        offerCode,
        paymentMethod: resolvedPaymentMethod,
        saveAsQuote: asQuote,
        orderDiscount: parsedOrderDiscount.discount,
        tableTag: isProject ? undefined : tableTag.trim() || undefined,
        deliveryNotes: deliveryNotes.trim() || undefined,
        depositPercent: deposit,
        feesTotal: isProject ? feesAmount : undefined,
        orderType: isProject ? undefined : orderType,
        serviceDate,
        guests: isProject || !guests.trim() ? null : Number(guests),
        deliveryAddress:
          isProject || orderType === "delivery"
            ? deliveryAddress.trim() || undefined
            : undefined,
        paymentReference: paymentReference.trim() || undefined,
      });
    } catch {
      setSubmitting(false);
      setFeedback("Could not save. Try again.");
      return;
    }
    setSubmitting(false);
    if (result.ok) {
      router.refresh();
      const isQuote = result.savedAsQuote ?? asQuote;
      const resolvedCustomerName = trimmedWalkInName || matchedCustomer?.name || null;
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
            paymentMethod: resolvedPaymentMethod || "Payment pending",
            cart,
            totals,
            serviceDate,
            siteAddress: deliveryAddress,
            depositPercent: deposit,
          }),
        );
      }
      setCart([]);
      setOfferPick("");
      setOfferCustom("");
      setServiceDate(localDayKey(new Date()));
      setPaymentMethod("PENDING");
      setPaymentReference("");
      setCustomerMobile("");
      setCustomerName("");
      setNotes("");
      setTableTag("");
      setGuests("");
      setDeliveryAddress("");
      setFeesInput("");
      if (result.orderNumber) {
        setFeedback(
          isQuote
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
        setFeedback(isQuote ? "Quotation saved." : "Bill saved successfully.");
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
          <span className="rounded-full bg-[var(--ob-primary)] px-2.5 py-0.5 text-xs font-medium text-[var(--ob-primary-foreground)]">
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
            Mobile number <span className="text-[var(--ob-danger)]">*</span>
          </span>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={customerMobile}
            onChange={(e) => {
              setCustomerMobile(e.target.value);
              setLastSavedDocument(null);
            }}
            placeholder="e.g. 9876543210"
            className="mt-1"
            aria-describedby="billing-mobile-hint"
          />
          <span
            id="billing-mobile-hint"
            className="mt-1 block text-xs text-[var(--ob-text-muted)]"
          >
            {matchedCustomer
              ? `Existing customer: ${matchedCustomer.name}`
              : "The customer is matched or created automatically."}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Name <span className="font-normal">(optional)</span>
          </span>
          <Input
            type="text"
            autoComplete="name"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setLastSavedDocument(null);
            }}
            placeholder="Defaults to 'User'"
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            {isProject
              ? (projectCopy?.dateLabel ?? "Delivery / installation date")
              : "Date"}
          </span>
          <Input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="mt-1"
            aria-label={isProject ? "Installation date" : "Service date"}
          />
        </label>
        {isProject ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              {projectCopy?.siteLabel ?? "Site address"}
            </span>
            <textarea
              className="ob-input mt-1 w-full"
              rows={2}
              value={deliveryAddress}
              onChange={(e) => {
                setDeliveryAddress(e.target.value);
                setLastSavedDocument(null);
              }}
              placeholder={projectCopy?.sitePlaceholder ?? "Site address…"}
            />
          </label>
        ) : null}
        {!isProject ? (
          <>
            <div>
              <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                Order type
              </span>
              <div
                role="radiogroup"
                aria-label="Order type"
                className="mt-1 flex flex-wrap gap-2"
              >
                {(
                  [
                    ["dine_in", "Dine-in"],
                    ["takeaway", "Take-away"],
                    ["delivery", "Delivery"],
                    ["online", "Online order"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={orderType === value}
                    onClick={() => setOrderType(value)}
                    className={cn(
                      "ob-touch-target rounded-full border px-3 py-1.5 text-sm transition",
                      orderType === value
                        ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)]"
                        : "border-[var(--ob-border)] bg-[var(--ob-surface)] hover:bg-[var(--ob-surface-muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {orderType === "dine_in" ? (
              <div className="flex flex-wrap gap-2">
                <label className="block min-w-[8rem] flex-1">
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
                <label className="block w-24">
                  <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                    Guests
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    placeholder="e.g. 2"
                    className="mt-1"
                  />
                </label>
              </div>
            ) : null}
            {orderType === "delivery" ? (
              <label className="block">
                <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                  Delivery address
                </span>
                <textarea
                  className="ob-input mt-1 w-full"
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Flat, street, landmark…"
                />
              </label>
            ) : null}
            {orderType === "takeaway" || orderType === "online" ? (
              <label className="block">
                <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                  Table / tag
                </span>
                <Input
                  value={tableTag}
                  onChange={(e) => setTableTag(e.target.value)}
                  placeholder="e.g. pickup token, order ref"
                  className="mt-1"
                />
              </label>
            ) : null}
          </>
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
        {isProject ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              {projectCopy?.chargesLabel ?? "Delivery & installation charges"}
            </span>
            <Input
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              value={feesInput}
              onChange={(e) => {
                setFeesInput(e.target.value);
                setLastSavedDocument(null);
              }}
              placeholder={projectCopy?.chargesPlaceholder ?? "0"}
              className="mt-1"
              aria-label="Delivery and installation charges"
              aria-invalid={!parsedFees.ok}
            />
            {!parsedFees.ok ? (
              <p role="alert" className="mt-1 text-xs text-[var(--ob-danger)]">
                {parsedFees.message}
              </p>
            ) : null}
          </label>
        ) : null}
        {savingAsQuote ? (
          <label className="block">
            <span className="text-xs font-medium text-[var(--ob-text-muted)]">
              {isProject
                ? (projectCopy?.depositLabel ?? "Advance / deposit %")
                : "Deposit % (optional)"}
            </span>
            <Input
              value={depositPercent}
              onChange={(e) => setDepositPercent(e.target.value)}
              placeholder="e.g. 30"
              className="mt-1"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Offer code <span className="font-normal">(optional)</span>
          </span>
          <select
            className="mt-1 w-full ob-input"
            value={offerPick}
            onChange={(e) => setOfferPick(e.target.value)}
            aria-label="Offer code"
          >
            <option value="">— None —</option>
            {offers
              .filter(
                (o): o is Offer & { code: string } =>
                  o.is_active !== false && Boolean(o.code),
              )
              .map((o) => (
                <option key={o.id} value={o.code}>
                  {o.code} · {o.name}
                </option>
              ))}
            <option value="__custom">Enter your own code…</option>
          </select>
          {offerPick === "__custom" ? (
            <Input
              value={offerCustom}
              onChange={(e) => setOfferCustom(e.target.value)}
              placeholder="Type offer code"
              className="mt-1"
            />
          ) : null}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--ob-text-muted)]">
            Notes <span className="font-normal">(optional)</span>
          </span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. no ice"
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
            <p role="alert" className="mt-2 text-xs text-[var(--ob-danger)]">
              {parsedOrderDiscount.message}
            </p>
          ) : null}
        </div>
        {!savingAsQuote ? (
          <>
            <label className="block">
              <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                Payment
              </span>
              <select
                className="mt-1 w-full ob-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                aria-label="Payment method"
              >
                <option value="PENDING">Payment pending</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
              </select>
            </label>
            {paymentMethod !== "PENDING" ? (
              <label className="block">
                <span className="text-xs font-medium text-[var(--ob-text-muted)]">
                  Payment reference{" "}
                  <span className="font-normal">(optional)</span>
                </span>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="UPI txn / card ref / platform order no"
                  maxLength={80}
                  className="mt-1"
                />
              </label>
            ) : null}
          </>
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
        {totals.feesTotal > 0 ? (
          <div className="flex justify-between text-[var(--ob-text-muted)]">
            <span>Delivery & installation</span>
            <span>{formatMoney(totals.feesTotal, currencyCode)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <span>{savingAsQuote ? "Quotation total" : "Total"}</span>
          <span>{formatMoney(totals.grandTotal, currencyCode)}</span>
        </div>
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
          className="ob-touch-target w-full"
          onClick={() => handleSubmit()}
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
                  ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)]"
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
                <section key={group.category} className="rounded-[var(--ob-radius-lg)] p-3">
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
      <div className="hidden w-full lg:block lg:w-[32%] xl:w-[28%] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
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
