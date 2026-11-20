"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import type { OpenState } from "@/lib/hours/working-hours";
import {
  ISSUE_KINDS,
  ISSUE_KIND_LABELS,
  answerLine,
  type OrderLookup,
  type SupportIssueKind,
} from "@/lib/support/self-serve";
import { findOrderAction, raiseIssueAction } from "@/services/support-actions";

type Receipt = { reference: string; headline: string; detail: string };

const EMPTY_FIELDS = { orderNumber: "", mobile: "" };

/** Open in leaf, last hour in honey, closed muted — the site pill's own order. */
const PILL_TONE: Record<OpenState["status"], "success" | "warning" | "neutral"> = {
  open: "success",
  closing_soon: "warning",
  closed: "neutral",
};

/**
 * The customer's own desk, in two steps on one screen: prove the bill is yours
 * with its number and the mobile it was placed on, then say what went wrong.
 *
 * Nothing is priced, filtered or decided here. The order card shows exactly
 * what `projectOrder` chose to release, and the answer after a write is
 * exactly what `supportReply` chose to say — this component moves those
 * strings around and keeps the buttons honest while a call is in flight.
 */
export function OrderLookupPanel({
  brandName,
  open,
  policy,
}: {
  brandName: string;
  open: OpenState;
  policy: readonly string[];
}) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderLookup | null>(null);

  const [kind, setKind] = useState<SupportIssueKind>("missing_item");
  const [detail, setDetail] = useState("");
  const [raising, setRaising] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const readyToFind = Boolean(fields.orderNumber.trim() && fields.mobile.trim());

  async function onFind() {
    if (searching || !readyToFind) return;
    setSearching(true);
    setLookupError(null);
    const result = await findOrderAction({
      orderNumber: fields.orderNumber,
      mobile: fields.mobile,
    });
    setSearching(false);
    if (!result.ok) {
      setOrder(null);
      setReceipt(null);
      setLookupError(result.message);
      return;
    }
    setOrder(result.order);
  }

  async function onRaise() {
    if (!order || raising) return;
    setRaising(true);
    setIssueError(null);
    // The bill number comes back from the projection rather than out of the
    // text box, so the write always targets the order the server just matched.
    const result = await raiseIssueAction({
      orderNumber: order.orderNumber,
      mobile: fields.mobile,
      kind,
      detail,
    });
    setRaising(false);
    if (!result.ok) {
      setIssueError(result.message);
      return;
    }
    setReceipt({
      reference: result.reference,
      headline: result.headline,
      detail: result.detail,
    });
  }

  function onReset() {
    setFields(EMPTY_FIELDS);
    setOrder(null);
    setReceipt(null);
    setDetail("");
    setKind("missing_item");
    setLookupError(null);
    setIssueError(null);
  }

  return (
    <div className="mt-10 space-y-6">
      <section className="ob-card ob-card-solid p-6 sm:p-7" aria-labelledby="policy-heading">
        <h2 id="policy-heading" className="ob-h2-cap">
          {brandName} returns and refunds
        </h2>
        <ul className="mt-5 space-y-3">
          {policy.map((line) => (
            <li
              key={line}
              className="flex gap-3 text-[15px] leading-relaxed text-[var(--ob-text-secondary)]"
            >
              <span
                aria-hidden
                className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ob-leaf)]"
              />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex flex-wrap items-center gap-3">
          <Badge tone={PILL_TONE[open.status]}>{open.pill}</Badge>
          <span className="text-[15px] text-[var(--ob-text-secondary)]">
            {answerLine(open)}
          </span>
        </p>
      </section>

      <section className="ob-card p-6 sm:p-7" aria-labelledby="lookup-heading">
        <h2 id="lookup-heading" className="ob-h2-cap">
          Find your bill
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ob-text-muted)]">
          The bill number is printed at the top of your receipt. We pair it with the mobile number
          the order was placed on, so a stranger with your bill number still sees nothing. A cash
          bill taken with no number on it cannot be found here — tell the counter instead.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Bill number</span>
            <input
              className="ob-input mt-1 w-full"
              value={fields.orderNumber}
              onChange={(event) => setFields({ ...fields, orderNumber: event.target.value })}
              maxLength={40}
              placeholder="BC-1057"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Mobile on the bill</span>
            <input
              className="ob-input mt-1 w-full"
              value={fields.mobile}
              onChange={(event) => setFields({ ...fields, mobile: event.target.value })}
              inputMode="tel"
              maxLength={20}
              placeholder="98274 89892"
              autoComplete="tel"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button onClick={onFind} disabled={!readyToFind} loading={searching}>
            Find my order
          </Button>
          {searching ? (
            <span role="status" className="text-[14px] text-[var(--ob-text-muted)]">
              Looking it up…
            </span>
          ) : null}
          {order ? (
            <button
              type="button"
              onClick={onReset}
              className="ob-btn-ghost rounded-full px-4 py-2 text-[14px]"
            >
              Start over
            </button>
          ) : null}
        </div>

        {lookupError ? (
          <p role="alert" className="mt-4 text-[15px] font-semibold text-[var(--ob-danger)]">
            {lookupError}
          </p>
        ) : null}

        {order ? (
          <div className="mt-7 border-t border-[var(--ob-border)] pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="ob-num text-[22px]">{order.orderNumber}</p>
              <Badge tone={order.status === "Cancelled" ? "danger" : "neutral"}>
                {order.status}
              </Badge>
            </div>
            <p className="mt-1 text-[14px] text-[var(--ob-text-muted)]">
              {order.customerName} · {formatDate(order.placedAt)} · {order.itemCount}{" "}
              {pluralize(order.itemCount, "line")}
            </p>
            <p className="ob-num mt-3 text-[26px]">
              {formatMoney(order.total, order.currencyCode)}
            </p>
            <ul className="mt-4 divide-y divide-[var(--ob-border)]">
              {order.lines.map((line) => (
                <li
                  key={`${line.name}-${line.quantity}`}
                  className="flex items-baseline justify-between gap-4 py-2 text-[15px]"
                >
                  <span>{line.name}</span>
                  <span className="ob-num text-[var(--ob-text-muted)]">×{line.quantity}</span>
                </li>
              ))}
            </ul>

            {receipt ? (
              <div className="mt-6 rounded-[var(--ob-radius-md)] border border-[var(--ob-border-strong)] bg-[var(--ob-tint-wash)] p-5">
                <p role="status" className="text-[15px] font-semibold text-[var(--ob-success)]">
                  {receipt.headline}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--ob-text-secondary)]">
                  {receipt.detail}
                </p>
                <p className="mt-4 text-[14px] text-[var(--ob-text-muted)]">
                  Your reference:{" "}
                  <span className="ob-num text-[var(--ob-text)]">{receipt.reference}</span>
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h3 className="ob-sec-label">Tell us what went wrong</h3>
                <label className="mt-4 block text-sm">
                  <span className="text-[var(--ob-text-muted)]">What was it</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as SupportIssueKind)}
                  >
                    {ISSUE_KINDS.map((option) => (
                      <option key={option} value={option}>
                        {ISSUE_KIND_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm">
                  <span className="text-[var(--ob-text-muted)]">In your own words</span>
                  <textarea
                    className="ob-input mt-1 w-full"
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="One flat white was missing from the bill, and the second one was wrong…"
                  />
                </label>

                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <Button onClick={onRaise} disabled={detail.trim().length < 3} loading={raising}>
                    Log this issue
                  </Button>
                  {raising ? (
                    <span role="status" className="text-[14px] text-[var(--ob-text-muted)]">
                      Writing it to the manager&apos;s list…
                    </span>
                  ) : null}
                </div>

                {issueError ? (
                  <p role="alert" className="mt-4 text-[15px] font-semibold text-[var(--ob-danger)]">
                    {issueError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
