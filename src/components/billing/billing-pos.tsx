"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer, OrderDiscountInput, Offer, Product, BrandRole } from "@/types/database";
import { formatModifierDelta, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { normalizeCustomerPhone } from "@/lib/security/input";
import { findCustomerByPhone } from "@/lib/demo/customer-identity";
import { localDayKey } from "@/lib/manager/time";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { LogoMark } from "@/components/brand/logo-mark";
import { PosProductTileWithButton } from "@/components/billing/pos-product-tile";
import {
  PosCatalogColumn,
  posColumnHeight,
} from "@/components/billing/pos-catalog-column";
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
import {
  defaultModifierSelection,
  modifierLabels,
  parseProductModifiers,
} from "@/lib/products/modifiers";
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
import { BillDocumentPreview } from "@/components/billing/bill-document-preview";
import { buildBillDocumentFromCheckout } from "@/lib/documents/build-bill-document";
import { getDocumentBrandProfile } from "@/lib/documents/brand-profile";
import { splitStateTax } from "@/lib/documents/pdf-layout";
import type { BillDocument } from "@/lib/documents/types";
import {
  categoryLabel,
  groupCategories,
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

/** Walk-in service modes. The label is what prints in the bill's context chips. */
const ORDER_TYPES = [
  ["dine_in", "Dine-in"],
  ["takeaway", "Take-away"],
  ["delivery", "Delivery"],
  ["online", "Online order"],
] as const;

function shortDay(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

/** Chips are a glance-line, not a preview pane. */
function clampText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  /* The bill wears the same letterhead the printed copy does, so the counter
     and the PDF agree on who is charging and for how much tax. */
  const issuer = brandCode
    ? getDocumentBrandProfile(brandCode, brandSettings)
    : null;
  const taxSplit = splitStateTax(taxRatePercent, totals.taxTotal);

  /** What the collapsed details panel is hiding, readable at a glance. */
  const contextChips: string[] = [];
  contextChips.push(shortDay(serviceDate));
  if (!isProject) {
    contextChips.push(
      ORDER_TYPES.find(([value]) => value === orderType)?.[1] ?? orderType,
    );
  }
  if (tableTag.trim()) contextChips.push(tableTag.trim());
  if (!isProject && guests.trim()) contextChips.push(`${guests.trim()} guests`);
  if (deliveryAddress.trim()) {
    contextChips.push(
      isProject ? "Site address noted" : `To ${clampText(deliveryAddress.trim(), 24)}`,
    );
  }
  if (deliveryNotes.trim()) contextChips.push(clampText(deliveryNotes.trim(), 24));
  if (isProject && parsedFees.ok && parsedFees.amount > 0) {
    contextChips.push(`Charges ${formatMoney(parsedFees.amount, currencyCode)}`);
  }
  if (offerCode.trim()) contextChips.push(offerCode.trim().toUpperCase());
  if (parsedOrderDiscount.ok && parsedOrderDiscount.discount) {
    const { type, value } = parsedOrderDiscount.discount;
    contextChips.push(
      type === "percent"
        ? `${value}% off`
        : `${formatMoney(value, currencyCode)} off`,
    );
  }
  if (!savingAsQuote && paymentMethod !== "PENDING") {
    contextChips.push(
      paymentReference.trim()
        ? `${paymentMethod} · ${clampText(paymentReference.trim(), 16)}`
        : paymentMethod,
    );
  }
  if (savingAsQuote && depositPercent.trim()) {
    contextChips.push(`Deposit ${depositPercent.trim()}%`);
  }
  if (notes.trim()) contextChips.push(`Note: ${clampText(notes.trim(), 22)}`);

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
    const groups = parseProductModifiers(product);
    if (groups.length) {
      setModifierPick({ product, ids: defaultModifierSelection(groups) });
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
      setDetailsOpen(true);
      setFeedback("Pick a valid date.");
      return;
    }
    if (!isProject && guests.trim()) {
      const g = Number(guests);
      if (!Number.isInteger(g) || g < 1 || g > 99) {
        setDetailsOpen(true);
        setFeedback("Guests must be a whole number between 1 and 99.");
        return;
      }
    }
    if (!parsedFees.ok) {
      setDetailsOpen(true);
      setFeedback(parsedFees.message);
      return;
    }
    if (!parsedOrderDiscount.ok) {
      setDetailsOpen(true);
      setFeedback(parsedOrderDiscount.message);
      return;
    }
    const roleCheck = validateManualOrderDiscountForRole(
      userRole,
      parsedOrderDiscount.discount,
    );
    if (!roleCheck.ok) {
      setDetailsOpen(true);
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
        setDetailsOpen(true);
        setFeedback(offerCheck.message);
        return;
      }
    }
    const deposit =
      depositPercent.trim() === ""
        ? null
        : Number(depositPercent);
    if (deposit != null && (!Number.isFinite(deposit) || deposit < 0 || deposit > 100)) {
      setDetailsOpen(true);
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

  const cartPanel =
    lastSavedDocument && cart.length === 0 ? (
      <BillDocumentPreview
        document={lastSavedDocument}
        className="h-full overflow-y-auto"
        actions={
          <OrderDocumentActions
            document={lastSavedDocument}
            compact
            dismissLabel={
              savingAsQuote ? "Start another quotation" : "Start the next bill"
            }
            onDismiss={() => setLastSavedDocument(null)}
          />
        }
      />
    ) : (
      <div className="ob-bill flex h-full min-h-0 flex-col">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {issuer?.logoPath ? (
              <span className="ob-bill-mark">
                {/* eslint-disable-next-line @next/next/no-img-element -- demo brand mark on the bill's letterhead */}
                <img
                  src={issuer.logoPath}
                  alt=""
                  width={40}
                  height={40}
                  className="h-7 w-auto max-w-[5.5rem] object-contain"
                />
              </span>
            ) : (
              <LogoMark size={30} />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {issuer?.legalName ?? receiptHeader}
              </p>
              <p className="truncate text-[11px] text-[var(--ob-text-muted)]">
                {issuer ? `${issuer.tagline} · ${issuer.phone}` : brandName}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="ob-bill-label mb-0.5">
              {savingAsQuote ? "Quotation" : "Tax invoice"}
            </p>
            <p className="text-[11px] text-[var(--ob-text-muted)]">
              {cartTitle}
            </p>
            <p className="text-xs font-medium">
              {itemCount > 0
                ? `${itemCount} ${itemCount === 1 ? "item" : "items"}`
                : "Draft"}
            </p>
          </div>
        </header>

        {modeHint ? (
          <p className="mt-2 text-[11px] text-[var(--ob-text-muted)]">
            {modeHint}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="ob-bill-label">
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
              placeholder="9876543210"
              aria-describedby="billing-mobile-hint"
            />
          </label>
          <label className="block">
            <span className="ob-bill-label">Name (optional)</span>
            <Input
              type="text"
              autoComplete="name"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setLastSavedDocument(null);
              }}
              placeholder="Walk-in name"
            />
          </label>
        </div>
        <p
          id="billing-mobile-hint"
          className="mt-1 text-[11px] text-[var(--ob-text-muted)]"
        >
          {matchedCustomer
            ? `Existing customer: ${matchedCustomer.name}`
            : "The customer is matched or created automatically."}
        </p>

        {!isProject || !savingAsQuote ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isProject ? (
              <div
                role="radiogroup"
                aria-label="Order type"
                className="flex flex-wrap gap-1.5"
              >
                {ORDER_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={orderType === value}
                    onClick={() => setOrderType(value)}
                    className={cn(
                      "ob-bill-chip ob-touch-target border px-2.5 py-1.5 text-[13px] transition",
                      orderType === value
                        ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] font-semibold text-[var(--ob-primary-foreground)]"
                        : "bg-[var(--ob-surface)] hover:bg-[var(--ob-surface-muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {!savingAsQuote ? (
              <select
                className="ob-input w-auto min-w-[8.5rem] py-1.5 text-[13px]"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                aria-label="Payment method"
              >
                <option value="PENDING">Payment pending</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
              </select>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {contextChips.map((chip) => (
            <span
              key={chip}
              className="ob-bill-chip border-[var(--ob-line)] bg-[var(--ob-tint-wash)] px-2 py-0.5 text-[11px] text-[var(--ob-text-muted)]"
            >
              {chip}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="ob-bill-chip border-[var(--ob-line-emphasis)] bg-transparent px-2 py-0.5 text-[11px] font-semibold text-[var(--ob-leaf)]"
          >
            {detailsOpen ? "Hide details" : "Edit details"}
          </button>
        </div>

        {detailsOpen ? (
          <div className="ob-bill-rule mt-2 grid gap-2 pt-2 sm:grid-cols-2">
            <label className="block">
              <span className="ob-bill-label">
                {isProject
                  ? (projectCopy?.dateLabel ?? "Delivery / installation date")
                  : "Date"}
              </span>
              <Input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                aria-label={isProject ? "Installation date" : "Service date"}
              />
            </label>
            {!isProject && orderType === "dine_in" ? (
              <>
                <label className="block">
                  <span className="ob-bill-label">Table / tag</span>
                  <Input
                    value={tableTag}
                    onChange={(e) => setTableTag(e.target.value)}
                    placeholder="e.g. T12"
                  />
                </label>
                <label className="block">
                  <span className="ob-bill-label">Guests</span>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    placeholder="e.g. 2"
                  />
                </label>
              </>
            ) : null}
            {!isProject &&
            (orderType === "takeaway" || orderType === "online") ? (
              <label className="block">
                <span className="ob-bill-label">Table / tag</span>
                <Input
                  value={tableTag}
                  onChange={(e) => setTableTag(e.target.value)}
                  placeholder="e.g. pickup token, order ref"
                />
              </label>
            ) : null}
            {(isProject || orderType === "delivery") && (
              <label className="block sm:col-span-2">
                <span className="ob-bill-label">
                  {isProject
                    ? (projectCopy?.siteLabel ?? "Site address")
                    : "Delivery address"}
                </span>
                <textarea
                  className="ob-input w-full"
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => {
                    setDeliveryAddress(e.target.value);
                    setLastSavedDocument(null);
                  }}
                  placeholder={
                    isProject
                      ? (projectCopy?.sitePlaceholder ?? "Site address…")
                      : "Flat, street, landmark…"
                  }
                />
              </label>
            )}
            {dedicatedFlow ? (
              <label className="block sm:col-span-2">
                <span className="ob-bill-label">Delivery / site notes</span>
                <Input
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Floor, installation, access…"
                />
              </label>
            ) : null}
            {isProject ? (
              <label className="block">
                <span className="ob-bill-label">
                  {projectCopy?.chargesLabel ??
                    "Delivery & installation charges"}
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
                <span className="ob-bill-label">
                  {isProject
                    ? (projectCopy?.depositLabel ?? "Advance / deposit %")
                    : "Deposit % (optional)"}
                </span>
                <Input
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(e.target.value)}
                  placeholder="e.g. 30"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="ob-bill-label">Offer code</span>
              <select
                className="ob-input w-full"
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
              <span className="ob-bill-label">Notes</span>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. no ice"
              />
            </label>
            <div className="sm:col-span-2">
              <span className="ob-bill-label">Order discount</span>
              <div className="flex flex-wrap gap-2">
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
                <p role="alert" className="mt-1 text-xs text-[var(--ob-danger)]">
                  {parsedOrderDiscount.message}
                </p>
              ) : null}
            </div>
            {paymentMethod !== "PENDING" && !savingAsQuote ? (
              <label className="block sm:col-span-2">
                <span className="ob-bill-label">Payment reference</span>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="UPI txn / card ref / platform order no"
                  maxLength={80}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="ob-bill-rule mt-3 min-h-0 flex-1 overflow-y-auto pt-2">
          {cart.length === 0 ? (
            <p className="py-4 text-sm text-[var(--ob-text-muted)]">
              {copy.emptyCartHint}
            </p>
          ) : (
            <ul className="text-sm">
              {cart.map((line, index) => (
                <li
                  key={cartLineKey(line.product.id, line.modifierIds)}
                  className="flex items-start gap-2 border-b border-dashed border-[var(--ob-line)] py-2 last:border-b-0"
                >
                  <span className="w-4 shrink-0 pt-2 text-[11px] text-[var(--ob-text-muted)]">
                    {index + 1}
                  </span>
                  <ProductThumbnail
                    name={line.product.name}
                    imageUrl={line.product.image_url}
                    category={line.product.category}
                    size="sm"
                    className="h-9 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium">{line.product.name}</p>
                      <p className="ob-bill-figure shrink-0 font-medium">
                        {formatMoney(lineTotal(line, priceTier), currencyCode)}
                      </p>
                    </div>
                    {line.modifierIds.length ? (
                      <p className="text-[11px] text-[var(--ob-text-muted)]">
                        {modifierLabels(line.product, line.modifierIds)}
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
                        <p className="text-[11px] text-[var(--ob-text-muted)]">
                          {line.product.unit ?? "unit"} · qty {line.quantity}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="ob-bill-chip ob-touch-target flex h-9 w-9 shrink-0 items-center justify-center hover:bg-[var(--ob-surface-muted)]"
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
                          className="ob-input py-1.5 text-center"
                          style={{ width: "3rem" }}
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
                          className="ob-bill-chip ob-touch-target flex h-9 w-9 shrink-0 items-center justify-center hover:bg-[var(--ob-surface-muted)]"
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
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="ob-bill-rule mt-2 space-y-1 pt-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt>List subtotal</dt>
            <dd className="ob-bill-figure">
              {formatMoney(totals.listSubtotal, currencyCode)}
            </dd>
          </div>
          {totals.productDiscountTotal > 0 ? (
            <div className="flex justify-between gap-3 text-[var(--ob-success)]">
              <dt>Product discounts</dt>
              <dd className="ob-bill-figure">
                −{formatMoney(totals.productDiscountTotal, currencyCode)}
              </dd>
            </div>
          ) : null}
          {totals.orderDiscountAmount > 0 ? (
            <div className="flex justify-between gap-3 text-[var(--ob-success)]">
              <dt>Order discount</dt>
              <dd className="ob-bill-figure">
                −{formatMoney(totals.orderDiscountAmount, currencyCode)}
              </dd>
            </div>
          ) : null}
          {totals.offerDiscountAmount > 0 ? (
            <div className="flex justify-between gap-3 text-[var(--ob-success)]">
              <dt>Offer discount</dt>
              <dd className="ob-bill-figure">
                −{formatMoney(totals.offerDiscountAmount, currencyCode)}
              </dd>
            </div>
          ) : null}
          {totals.feesTotal > 0 ? (
            <div className="flex justify-between gap-3 text-[var(--ob-text-muted)]">
              <dt>Delivery & installation</dt>
              <dd className="ob-bill-figure">
                {formatMoney(totals.feesTotal, currencyCode)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-[var(--ob-line)] pt-1.5 font-medium">
            <dt>Taxable amount</dt>
            <dd className="ob-bill-figure">
              {formatMoney(totals.taxableSubtotal, currencyCode)}
            </dd>
          </div>
          {taxRatePercent > 0 ? (
            <>
              <div className="flex justify-between gap-3 text-[var(--ob-text-muted)]">
                <dt>CGST ({taxRatePercent / 2}%)</dt>
                <dd className="ob-bill-figure">
                  {formatMoney(taxSplit.cgstAmount, currencyCode)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-[var(--ob-text-muted)]">
                <dt>SGST ({taxRatePercent / 2}%)</dt>
                <dd className="ob-bill-figure">
                  {formatMoney(taxSplit.sgstAmount, currencyCode)}
                </dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between gap-3 text-[var(--ob-text-muted)]">
              <dt>Tax ({taxRatePercent}%)</dt>
              <dd className="ob-bill-figure">
                {formatMoney(totals.taxTotal, currencyCode)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-[var(--ob-line)] pt-1.5 text-base font-semibold">
            <dt>{savingAsQuote ? "Quotation total" : "Total payable"}</dt>
            <dd className="ob-bill-figure">
              {formatMoney(totals.grandTotal, currencyCode)}
            </dd>
          </div>
        </dl>

        {receiptFooter ? (
          <p className="mt-2 text-[11px] text-[var(--ob-text-muted)]">
            {receiptFooter}
          </p>
        ) : null}

        {feedback ? (
          <p
            className={cn(
              "mt-2 text-sm",
              feedback.includes("saved to Orders") ||
                feedback.includes("saved successfully")
                ? "text-[var(--ob-success)]"
                : "text-[var(--ob-text-secondary)]",
            )}
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        <Button
          className="ob-touch-target mt-3 w-full"
          onClick={() => handleSubmit()}
          loading={submitting}
          disabled={!cart.length}
        >
          {confirmLabel}
        </Button>
      </div>
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
        stockLabel={stockLabel}
        lowStock={isLowStock(product)}
        onAdd={() => tryAddProduct(product)}
        onPeek={() => setPeekProduct(displayProduct)}
      />
    );
  };

  const catalogSection = (
    <PosCatalogColumn
      searchPlaceholder={copy.searchPlaceholder}
      search={search}
      onSearch={setSearch}
      categories={categories}
      category={category}
      onCategory={setCategory}
      products={filtered}
      renderTile={productTile}
    />
  );

  const cartAside = (
    <div
      className={cn(
        "hidden w-full lg:block lg:w-[32%] lg:overflow-y-auto xl:w-[28%]",
        posColumnHeight,
      )}
    >
      {cartPanel}
    </div>
  );

  return (
    <div className="relative space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      {modifierPick ? (
        <div className="ob-veil fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <Card className="w-full max-w-md p-4">
            <h3 className="font-semibold">{modifierPick.product.name}</h3>
            <div className="mt-3 space-y-4">
              {parseProductModifiers(modifierPick.product).map((group) => {
                const inGroup = group.options.map((option) => option.id);
                return (
                  <fieldset key={group.id}>
                    <legend className="flex w-full items-baseline justify-between gap-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
                      <span>{group.name}</span>
                      <span className="font-normal normal-case tracking-normal">
                        {group.type === "single"
                          ? group.required
                            ? "Pick one"
                            : "Pick one (optional)"
                          : "Choose any"}
                      </span>
                    </legend>
                    <ul className="space-y-2">
                      {group.options.map((option) => {
                        const on = modifierPick.ids.includes(option.id);
                        return (
                          <li key={option.id}>
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type={
                                  group.type === "single" ? "radio" : "checkbox"
                                }
                                name={`${modifierPick.product.id}-${group.id}`}
                                checked={on}
                                onChange={() => {
                                  setModifierPick((prev) => {
                                    if (!prev) return prev;
                                    const rest = prev.ids.filter(
                                      (id) => !inGroup.includes(id),
                                    );
                                    return {
                                      ...prev,
                                      ids:
                                        group.type === "single"
                                          ? [...rest, option.id]
                                          : on
                                            ? rest
                                            : [...prev.ids, option.id],
                                    };
                                  });
                                }}
                              />
                              <span className="flex-1">{option.name}</span>
                              <span className="text-[var(--ob-text-muted)]">
                                {formatModifierDelta(
                                  option.price,
                                  currencyCode,
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                );
              })}
            </div>
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
                {copy.addButton}
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

      <div className="ob-glass-bar ob-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--ob-border)] p-3 lg:hidden">
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
            className="ob-scrim absolute inset-0"
            aria-label="Close bill"
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="ob-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(90vh,900px)] overflow-y-auto rounded-t-[var(--ob-radius-2xl)] bg-[var(--ob-glass-strong)] p-4 pb-6">
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
