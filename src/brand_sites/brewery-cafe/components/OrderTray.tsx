'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { modifierLabels } from '@/lib/products/modifiers';
import { placeSiteOrder, type PlaceSiteOrderResult } from '@/services/site-order-actions';
import {
  MAX_QTY,
  lineItems,
  money,
  trayTotals,
  type CartAction,
  type CartState,
  type Tray,
} from './cart';

/** How the customer means to take the order — the same three the counter uses. */
const MODES = [
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Home delivery' },
] as const;

type Mode = (typeof MODES)[number]['value'];

const TENDERS = [
  { value: '', label: 'Pay at the counter' },
  { value: 'UPI', label: 'UPI at the counter' },
  { value: 'Card', label: 'Card at the counter' },
] as const;

const EMPTY_FORM = {
  name: '',
  phone: '',
  note: '',
  tender: '',
  mode: 'takeaway' as Mode,
  guests: '',
  address: '',
};

interface OrderTrayProps {
  brand: { taxRatePercent: number };
  tray: Tray;
  cart: CartState;
  dispatch: (action: CartAction) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One line that tells the counter what this order actually is. */
function modeSummary(form: typeof EMPTY_FORM): string {
  if (form.mode === 'dine_in') {
    return form.guests.trim() ? `Dine-in · table for ${form.guests.trim()}` : 'Dine-in';
  }
  if (form.mode === 'delivery') {
    return form.address.trim()
      ? `Home delivery · ${form.address.trim()}`
      : 'Home delivery · add the address below';
  }
  return 'Takeaway · we text when it is up';
}

/**
 * The tray is the order. Nothing here prices anything: the same helpers that
 * build a bill at the counter work out each line, the GST and the total, and
 * the payload goes to `placeSiteOrder`, which re-checks all of it server-side
 * before writing an order into the brand's own Orders screen.
 */
export function OrderTray({ brand, tray, cart, dispatch, open, onOpenChange }: OrderTrayProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ number: string; mode: string } | null>(null);

  const lines = useMemo(() => lineItems(cart, tray), [cart, tray]);
  const totals = useMemo(
    () => trayTotals(cart, tray, brand.taxRatePercent),
    [cart, tray, brand.taxRatePercent],
  );
  const count = lines.reduce((n, line) => n + line.qty, 0);
  const idle = count === 0 && !ticket;

  const place = useCallback(async () => {
    if (!lines.length || sending) return;
    setSending(true);
    setError(null);
    const result: PlaceSiteOrderResult = await placeSiteOrder({
      lines: lines.map((line) => ({
        productId: line.item.id,
        quantity: line.qty,
        optionIds: line.optionIds,
      })),
      name: form.name,
      phone: form.phone,
      note: form.note,
      tender: form.tender,
      mode: form.mode,
      guests: form.guests,
      address: form.address,
    });
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTicket({ number: result.orderNumber, mode: modeSummary(form) });
    setForm(EMPTY_FORM);
    dispatch({ type: 'clear' });
    onOpenChange(true);
  }, [dispatch, form, lines, onOpenChange, sending]);

  return (
    <aside
      className="bc-tray"
      aria-label="Your order"
      data-open={open ? 'true' : 'false'}
      data-idle={idle ? 'true' : 'false'}
    >
      {/* Phones and tablets get the tray as a constant bar pinned over the
          scrolling menu; desktop hides the bar and keeps the sticky side panel. */}
      <button
        type="button"
        className="bc-tray-bar bc-display"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{count > 0 ? `${count} on your tray` : 'Your order'}</span>
        <span className="bc-tray-bar-total" key={totals.grandTotal}>
          {money(tray, totals.grandTotal)}
        </span>
        <span className="bc-tray-bar-chev" aria-hidden>
          {open ? '▾' : '▴'}
        </span>
      </button>
      <div className="bc-tray-scrim" aria-hidden onClick={() => onOpenChange(false)} />
      <div className="bc-tray-panel">
        {ticket && lines.length === 0 ? (
          <div className="bc-ticket" key={ticket.number}>
            <p className="bc-ticket-stamp bc-display">Order placed</p>
            <p className="bc-ticket-no bc-display">{ticket.number}</p>
            <p className="bc-ticket-mode">{ticket.mode}</p>
            <p className="bc-ticket-eta">
              The counter has it on screen now. Ready in about fifteen minutes — we call the number
              on the ticket, not the name.
            </p>
            <button type="button" className="bc-tray-restart" onClick={() => setTicket(null)}>
              Start another order
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="bc-tray-empty">
            <p className="bc-tray-head bc-display">Your order</p>
            <p>Nothing on the tray yet — tap + on anything.</p>
          </div>
        ) : (
          <>
            <p className="bc-tray-head bc-display">Your order</p>
            <ul className="bc-tray-lines">
              {lines.map((line) => (
                <li key={line.key} className="bc-tray-line">
                  <Image
                    src={line.item.src}
                    alt=""
                    width={96}
                    height={96}
                    className="bc-tray-thumb"
                  />
                  <div className="bc-tray-line-info">
                    <p className="bc-display text-[13px] leading-tight text-[var(--bc-ink)]">
                      {line.item.name}
                    </p>
                    {modifierLabels(line.item.product, line.optionIds) ? (
                      <p className="bc-tray-variant">
                        {modifierLabels(line.item.product, line.optionIds)}
                      </p>
                    ) : null}
                    <p className="bc-tray-each">
                      {line.item.wasPrice ? (
                        <s className="bc-tray-each-was">{line.item.wasPrice}</s>
                      ) : null}
                      {money(tray, line.unitPrice)} each
                    </p>
                  </div>
                  <div className="bc-tray-step">
                    <button
                      type="button"
                      aria-label={`One fewer ${line.item.name}`}
                      onClick={() => dispatch({ type: 'setQty', id: line.key, qty: line.qty - 1 })}
                    >
                      −
                    </button>
                    <span aria-live="polite">{line.qty}</span>
                    <button
                      type="button"
                      disabled={line.qty >= MAX_QTY}
                      aria-label={`One more ${line.item.name}`}
                      onClick={() => dispatch({ type: 'setQty', id: line.key, qty: line.qty + 1 })}
                    >
                      +
                    </button>
                  </div>
                  <span className="bc-tray-line-total">{money(tray, line.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <p className="bc-tray-mode-line">{modeSummary(form)}</p>

            <dl className="bc-tray-totals">
              <div>
                <dt>List subtotal</dt>
                <dd>{money(tray, totals.listSubtotal)}</dd>
              </div>
              {totals.productDiscountTotal > 0 ? (
                <div className="bc-tray-save">
                  <dt>Menu offers</dt>
                  <dd>−{money(tray, totals.productDiscountTotal)}</dd>
                </div>
              ) : null}
              <div>
                <dt>GST {brand.taxRatePercent}%</dt>
                <dd>{money(tray, totals.taxTotal)}</dd>
              </div>
              <div className="bc-tray-grand">
                <dt className="bc-display">Total</dt>
                <dd className="bc-tray-total" key={totals.grandTotal}>
                  {money(tray, totals.grandTotal)}
                </dd>
              </div>
            </dl>

            {ticket ? (
              <p className="bc-tray-sent">
                Last one through: <span className="bc-display">{ticket.number}</span>
              </p>
            ) : null}

            <div className="bc-tray-form">
              <fieldset className="bc-tray-mode">
                <legend>How will you take it</legend>
                <div role="radiogroup" aria-label="How will you take it" className="bc-tray-mode-opts">
                  {MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={form.mode === m.value}
                      data-on={form.mode === m.value ? 'true' : 'false'}
                      onClick={() => setForm({ ...form, mode: m.value })}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {form.mode === 'dine_in' ? (
                <label>
                  <span>How many at the table</span>
                  <input
                    value={form.guests}
                    onChange={(e) => setForm({ ...form, guests: e.target.value })}
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="2"
                  />
                </label>
              ) : null}

              {form.mode === 'delivery' ? (
                <label>
                  <span>Deliver to — flat, street, landmark, pincode</span>
                  <textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    maxLength={300}
                    rows={2}
                    placeholder="304, Sea View, 5th Road, 395007"
                  />
                </label>
              ) : null}

              <label>
                <span>Name for the ticket</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={120}
                  placeholder="Any name you like"
                  autoComplete="name"
                />
              </label>
              <label>
                <span>Mobile — we text when it is up</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  inputMode="tel"
                  maxLength={20}
                  placeholder="98765 43210"
                  autoComplete="tel"
                />
              </label>
              <label>
                <span>Anything the counter should know</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  maxLength={500}
                  rows={2}
                  placeholder="No ice, extra napkins, collecting at six…"
                />
              </label>
              <label>
                <span>Settling up</span>
                <select
                  value={form.tender}
                  onChange={(e) => setForm({ ...form, tender: e.target.value })}
                >
                  {TENDERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? (
              <p role="alert" className="bc-tray-error">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="bc-btn bc-tray-place"
              disabled={sending}
              onClick={place}
            >
              {sending ? 'Sending to the counter…' : 'Place order'}
            </button>
            <p className="bc-tray-fine">
              Nothing is charged here. The bill is created unpaid and settled when you collect.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
