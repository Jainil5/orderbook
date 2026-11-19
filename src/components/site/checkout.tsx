"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Bike,
  Loader2,
  Minus,
  Plus,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import { computeCartTotals } from "@/lib/pricing/discounts";
import { validateOfferCodeForCart } from "@/lib/pricing/offers";
import { formatMoney } from "@/lib/format";
import type { WebOrderResult } from "@/lib/demo/server";
import type { Offer, Product } from "@/types/database";
import type { SiteMenuItem } from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";
import { cartLineKey, useCart, type CartLine } from "./cart-provider";

type PlacedOrder = {
  orderNumber: string;
  grandTotal: number;
  itemCount: number;
};

/**
 * The order tab: the cart from the menu tab, a name and a way to reach the
 * customer, then one JSON POST to the storefront's own endpoint that writes
 * the ticket into the brand's OrderBook workspace with `order_type: "online"`
 * — the counter sees it, not a webhook.
 *
 * The submit is a plain `fetch`, not a server action, because this page is the
 * one surface customers use and customers come through CDNs, carrier proxies
 * and the preview gateway. An action response is framework-internal
 * (`text/x-component`) and any hop that re-encodes it leaves the visitor with
 * "an unexpected response from the server" — the ticket is written, but the
 * screen shows a crash. A JSON endpoint survives every proxy unchanged, so the
 * confirmation always reaches the person who just paid for the coffee.
 */
export function SiteCheckout({
  profile,
  items,
  offers,
  currencyCode,
  taxRatePercent,
}: {
  profile: SiteProfile;
  items: SiteMenuItem[];
  offers: Offer[];
  currencyCode: string;
  taxRatePercent: number;
}) {
  const cart = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfilment, setFulfilment] = useState<"takeaway" | "delivery">(
    "takeaway",
  );
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [offerInput, setOfferInput] = useState("");
  const [appliedOffer, setAppliedOffer] = useState<
    { code: string; name: string; amount: number } | null
  >(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  // The site card prices are the products' effective prices, so the same
  // computeCartTotals the counter uses produces the same tax and totals.
  const { lineUnitPrice } = cart;
  const pricedLines = useMemo(
    () =>
      cart.lines.flatMap((line) => {
        const item = itemById.get(line.productId);
        if (!item) return [];
        return [
          {
            product: { price: lineUnitPrice(line) } as Product,
            quantity: line.quantity,
          },
        ];
      }),
    [cart.lines, lineUnitPrice, itemById],
  );

  const totals = useMemo(
    () =>
      computeCartTotals({
        lines: pricedLines,
        taxRatePercent,
        orderDiscount: null,
        offerDiscountAmount: appliedOffer?.amount ?? 0,
      }),
    [pricedLines, taxRatePercent, appliedOffer],
  );

  // The live line under the totals, worded like the reference sites'
  // reservation summary — including whatever is still missing.
  const summary = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      cart.lines.length
        ? `${cart.itemCount} ${profile.summaryWords.items}`
        : `nothing in the ${profile.madeToOrder ? "list" : "tray"} yet`,
    );
    parts.push(
      fulfilment === "delivery"
        ? profile.fulfilment.delivery
        : profile.fulfilment.takeaway,
    );
    if (appliedOffer) parts.push(`${appliedOffer.code} applied`);
    parts.push(name.trim() ? `for ${name.trim()}` : "we still need a name");
    if (fulfilment === "delivery" && !address.trim())
      parts.push(
        profile.madeToOrder ? "no site address" : "no delivery address",
      );
    if (totals.grandTotal) parts.push(formatMoney(totals.grandTotal, currencyCode));
    return parts.join(" · ");
  }, [
    cart.itemCount,
    cart.lines.length,
    profile,
    fulfilment,
    address,
    appliedOffer,
    name,
    totals.grandTotal,
    currencyCode,
  ]);

  const applyOffer = () => {
    setOfferError(null);
    const verdict = validateOfferCodeForCart(
      offerInput,
      offers,
      pricedLines,
      totals.subtotalAfterProductDiscounts,
    );
    if (!verdict.ok) {
      setAppliedOffer(null);
      setOfferError(verdict.message);
      return;
    }
    setAppliedOffer({
      code: verdict.offer.code ?? offerInput,
      name: verdict.offer.name,
      amount: verdict.amount,
    });
    setOfferInput("");
  };

  const placeOrder = () => {
    setError(null);
    startTransition(async () => {
      const body = JSON.stringify({
        customerName: name,
        phone: phone.trim() || undefined,
        fulfilment,
        address: address || undefined,
        notes: notes || undefined,
        offerCode: appliedOffer?.code,
        lines: cart.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          modifierIds: line.modifierIds,
        })),
      });
      try {
        const response = await fetch(`/api/site/${profile.code}/order`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        const result = (await response.json().catch(() => null)) as
          | WebOrderResult
          | null;
        if (!result || result.ok !== true) {
          setError(
            result?.ok === false
              ? result.message
              : `The shop did not confirm your order (HTTP ${response.status}) — please try again.`,
          );
          return;
        }
        setPlaced({
          orderNumber: result.orderNumber,
          grandTotal: result.grandTotal,
          itemCount: result.itemCount,
        });
        cart.clear();
      } catch {
        setError(
          "Your connection dropped before the order reached the counter — nothing was charged, try once more.",
        );
      }
    });
  };

  if (placed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="site-spot mx-auto max-w-xl p-8 text-center"
      >
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--site-accent)] text-[var(--site-accent-ink)]"
        >
          <BadgeCheck className="h-7 w-7" aria-hidden />
        </motion.span>
        <h2 className="site-display mt-5 text-3xl">
          Order {placed.orderNumber} received
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--site-muted)]">
          {profile.confirmation}
        </p>
        <p className="mt-4 text-sm">
          {placed.itemCount} {placed.itemCount === 1 ? "item" : "items"} ·{" "}
          <span className="font-semibold text-[var(--site-accent)]">
            {formatMoney(placed.grandTotal, currencyCode)}
          </span>{" "}
          {profile.madeToOrder ? "· quoted incl. GST" : "· payable at pickup"}
        </p>
        <p className="mt-2 text-xs text-[var(--site-muted)]">
          The ticket is already on the brand&apos;s OrderBook board, flagged
          &ldquo;Online order&rdquo; with your name on it.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/site/${profile.code}`}
            className="rounded-full border border-[var(--site-line-strong)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"
          >
            Back to the {profile.menuTab.toLowerCase()}
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Cart */}
      <div>
        <h2 className="site-display text-3xl sm:text-4xl">
          Your {profile.madeToOrder ? "enquiry list" : "cart"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--site-muted)]">
          {profile.orderIntro}
        </p>

        {cart.lines.length === 0 ? (
          <div className="site-spot mt-8 p-8 text-center">
            <p className="font-medium">Nothing picked yet.</p>
            <p className="mt-2 text-sm text-[var(--site-muted)]">
              {profile.madeToOrder
                ? "Add pieces from the catalog and the workshop gets the list."
                : "Add things from the menu and the counter gets the ticket."}
            </p>
            <Link
              href={`/site/${profile.code}#card`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:brightness-110"
            >
              Browse the {profile.menuTab.toLowerCase()}
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            <AnimatePresence initial={false}>
              {cart.lines.map((line) => (
                <CartRow
                  key={cartLineKey(line)}
                  line={line}
                  label={itemById.get(line.productId)?.name ?? "Item"}
                  image={itemById.get(line.productId)?.imageUrl ?? null}
                  unitPrice={cart.lineUnitPrice(line)}
                  lineTotal={cart.lineTotal(line)}
                  currencyCode={currencyCode}
                  onQty={(quantity) =>
                    cart.setQty(cartLineKey(line), quantity)
                  }
                  onRemove={() => cart.remove(cartLineKey(line))}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}

        {cart.lines.length ? (
          <button
            type="button"
            onClick={cart.clear}
            className="mt-4 text-xs text-[var(--site-muted)] underline-offset-2 hover:text-[var(--site-text)] hover:underline"
          >
            Clear everything
          </button>
        ) : null}
      </div>

      {/* Details + totals */}
      <div className="site-spot h-fit p-6 lg:sticky lg:top-24">
        <h3 className="site-display text-xl">
          {profile.madeToOrder ? "Where do we send the designer?" : "Who is this for?"}
        </h3>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFulfilment("takeaway")}
              data-active={fulfilment === "takeaway"}
              className="flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-medium transition data-[active=true]:border-[var(--site-accent)] data-[active=true]:bg-[var(--site-accent-soft)] data-[active=true]:text-[var(--site-accent)]"
            >
              <Store className="h-4 w-4" aria-hidden /> {profile.fulfilment.takeaway}
            </button>
            <button
              type="button"
              onClick={() => setFulfilment("delivery")}
              data-active={fulfilment === "delivery"}
              className="flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-medium transition data-[active=true]:border-[var(--site-accent)] data-[active=true]:bg-[var(--site-accent-soft)] data-[active=true]:text-[var(--site-accent)]"
            >
              <Bike className="h-4 w-4" aria-hidden /> {profile.fulfilment.delivery}
            </button>
          </div>

          <SiteField label="Your name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoComplete="name"
              placeholder={profile.madeToOrder ? "Ananya Mehra" : "Name for the ticket"}
              className="site-input"
            />
          </SiteField>
          <SiteField label="Mobile (optional — links the order to you in the CRM)">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              maxLength={16}
              autoComplete="tel"
              placeholder="+91 98765 43210"
              className="site-input"
            />
          </SiteField>
          {fulfilment === "delivery" ? (
            <SiteField label={profile.madeToOrder ? "Site address" : "Delivery address"}>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={240}
                autoComplete="street-address"
                placeholder="Flat, street, landmark, city"
                className="site-input"
              />
            </SiteField>
          ) : null}
          <SiteField label={profile.madeToOrder ? "Spec & notes" : "Notes for the counter"}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder={profile.notesPlaceholder}
              className="site-input resize-none"
            />
          </SiteField>

          {offers.length ? (
            <SiteField label="Offer code">
              {appliedOffer ? (
                <div className="flex items-center justify-between rounded-xl border border-[var(--site-accent)] bg-[var(--site-accent-soft)] px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-[var(--site-accent)]">
                    <Tag className="h-3.5 w-3.5" aria-hidden />
                    {appliedOffer.code} · {appliedOffer.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAppliedOffer(null)}
                    className="text-xs text-[var(--site-muted)] hover:text-[var(--site-text)]"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={offerInput}
                    onChange={(event) => setOfferInput(event.target.value)}
                    maxLength={64}
                    placeholder={offers
                      .map((offer) => offer.code)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(" or ")}
                    className="site-input"
                  />
                  <button
                    type="button"
                    onClick={applyOffer}
                    className="shrink-0 rounded-xl border border-[var(--site-line-strong)] px-4 text-sm font-medium transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"
                  >
                    Apply
                  </button>
                </div>
              )}
              {offerError ? (
                <p className="mt-1.5 text-xs text-[#ff8a92]">{offerError}</p>
              ) : null}
            </SiteField>
          ) : null}
        </div>

        <dl className="mt-6 space-y-1.5 border-t border-[var(--site-line)] pt-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--site-muted)]">Subtotal</dt>
            <dd>{formatMoney(totals.subtotalAfterProductDiscounts, currencyCode)}</dd>
          </div>
          {totals.offerDiscountAmount > 0 ? (
            <div className="flex justify-between text-[var(--site-accent)]">
              <dt>Offer {appliedOffer?.code}</dt>
              <dd>−{formatMoney(totals.offerDiscountAmount, currencyCode)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-[var(--site-muted)]">
              GST ({taxRatePercent}%)
            </dt>
            <dd>{formatMoney(totals.taxTotal, currencyCode)}</dd>
          </div>
          <div className="flex justify-between border-t border-[var(--site-line)] pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="text-[var(--site-accent)]">
              {formatMoney(totals.grandTotal, currencyCode)}
            </dd>
          </div>
        </dl>

        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={summary}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            aria-live="polite"
            className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--site-muted)]"
          >
            {summary}
          </motion.p>
        </AnimatePresence>

        {error ? (
          <p className="mt-3 rounded-xl border border-[#ff4d5a]/40 bg-[#ff4d5a]/10 px-3 py-2 text-xs text-[#ff8a92]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={placeOrder}
          disabled={pending || cart.lines.length === 0 || !name.trim()}
          className="ob-press mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending to{" "}
              {profile.name}…
            </>
          ) : (
            <>
              {profile.madeToOrder ? "Send enquiry" : "Place order"}
              {cart.lines.length
                ? ` · ${formatMoney(totals.grandTotal, currencyCode)}`
                : ""}
            </>
          )}
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--site-muted)]">
          Demo storefront: the order is written into this browser&apos;s
          OrderBook workspace and marked &ldquo;Online order&rdquo;. No payment
          is taken here.
        </p>
      </div>
    </div>
  );
}

function SiteField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--site-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function CartRow({
  line,
  label,
  image,
  unitPrice,
  lineTotal,
  currencyCode,
  onQty,
  onRemove,
}: {
  line: CartLine;
  label: string;
  image: string | null;
  unitPrice: number;
  lineTotal: number;
  currencyCode: string;
  onQty: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25 }}
      className="site-spot flex items-center gap-4 p-3"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--site-muted)]">
          {formatMoney(unitPrice, currencyCode)} each
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onQty(line.quantity - 1)}
          aria-label="One fewer"
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--site-line)] transition hover:border-[var(--site-accent)]"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">
          {line.quantity}
        </span>
        <button
          type="button"
          onClick={() => onQty(line.quantity + 1)}
          aria-label="One more"
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--site-line)] transition hover:border-[var(--site-accent)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <p className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
        {formatMoney(lineTotal, currencyCode)}
      </p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-[var(--site-muted)] transition hover:text-[#ff8a92]"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </motion.li>
  );
}
