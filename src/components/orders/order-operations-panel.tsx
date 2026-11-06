"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  createCreditNoteAction,
  recordPaymentAction,
  recordRefundAction,
  updateOrderStatusAction,
} from "@/services/operations-actions";
import { PrintReceiptButton } from "@/components/orders/print-receipt-button";
import { canVoidOrCreditNote, isDraftOrder } from "@/lib/orders/order-rules";

const STATUS_ACTIONS: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Confirm" },
  { status: "completed", label: "Complete" },
  { status: "cancelled", label: "Cancel" },
];

export function OrderOperationsPanel({
  order,
  currencyCode,
  publicQuoteUrl,
}: {
  order: Order;
  currencyCode: string;
  publicQuoteUrl?: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [splitLabel, setSplitLabel] = useState("");
  const [method, setMethod] = useState("UPI");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const balance = Math.max(
    0,
    order.grand_total - (order.amount_paid ?? 0),
  );

  async function onStatus(status: OrderStatus) {
    setBusy(status);
    setMessage(null);
    const result = await updateOrderStatusAction(order.id, status);
    setBusy(null);
    if (result.ok) router.refresh();
    else setMessage("message" in result ? result.message : "Could not update.");
  }

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    setBusy("pay");
    setMessage(null);
    const result = await recordPaymentAction({
      orderId: order.id,
      amount: value,
      method,
      splitLabel: splitLabel.trim() || undefined,
    });
    setBusy(null);
    if (result.ok) {
      setAmount("");
      router.refresh();
    } else {
      setMessage("message" in result ? result.message : "Payment failed.");
    }
  }

  async function onCreditNote() {
    setBusy("cn");
    setMessage(null);
    const result = await createCreditNoteAction(order.id);
    setBusy(null);
    if (result.ok) {
      router.refresh();
      setMessage(
        "orderNumber" in result
          ? `Credit note ${result.orderNumber} created.`
          : "Credit note created.",
      );
    } else {
      setMessage("message" in result ? result.message : "Could not create credit note.");
    }
  }

  async function onRefund(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(refundAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid refund amount.");
      return;
    }
    setBusy("refund");
    const result = await recordRefundAction({
      orderId: order.id,
      amount: value,
      reason: refundReason,
    });
    setBusy(null);
    if (result.ok) router.refresh();
    else setMessage("message" in result ? result.message : "Refund failed.");
  }

  return (
    <div className="ob-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Order actions</h2>
          <p className="text-xs text-[var(--ob-text-muted)]">
            Status: {order.status} · Payment: {order.payment_status}
            {order.amount_paid != null && order.amount_paid > 0
              ? ` · Paid ${formatMoney(order.amount_paid, currencyCode)}`
              : null}
            {order.parent_order_id ? " · Linked document" : null}
          </p>
          {!isDraftOrder(order) ? (
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Line items are locked — use credit note or refund for corrections.
            </p>
          ) : null}
        </div>
        <PrintReceiptButton orderId={order.id} />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_ACTIONS.map(({ status, label }) => (
          <Button
            key={status}
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            loading={busy === status}
            disabled={order.status === status}
            onClick={() => onStatus(status)}
          >
            {label}
          </Button>
        ))}
        {canVoidOrCreditNote(order) && !order.parent_order_id ? (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            loading={busy === "cn"}
            onClick={onCreditNote}
          >
            Issue credit note
          </Button>
        ) : null}
      </div>

      {balance > 0 ? (
        <form onSubmit={onPay} className="space-y-2">
          <p className="text-xs font-medium text-[var(--ob-text-muted)]">
            Record payment (split bill)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={`Amount (due ${formatMoney(balance, currencyCode)})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              placeholder="Split label (e.g. Person A)"
              value={splitLabel}
              onChange={(e) => setSplitLabel(e.target.value)}
            />
            <select
              className="ob-input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Bank transfer">Bank transfer</option>
            </select>
            <Button type="submit" loading={busy === "pay"}>
              Record payment
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-[var(--ob-success)]">Fully paid.</p>
      )}

      {order.amount_paid != null && order.amount_paid > 0 ? (
        <form onSubmit={onRefund} className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Refund amount"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
          />
          <Input
            placeholder="Reason"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
          <Button type="submit" variant="secondary" loading={busy === "refund"}>
            Record refund
          </Button>
        </form>
      ) : null}

      {publicQuoteUrl ? (
        <p className="text-xs text-[var(--ob-text-muted)]">
          Customer accept link:{" "}
          <a
            href={publicQuoteUrl}
            className="break-all text-[var(--ob-primary)]"
            target="_blank"
            rel="noopener noreferrer"
          >
            {publicQuoteUrl}
          </a>
        </p>
      ) : null}

      {message ? (
        <p className="text-sm text-[var(--ob-danger)]" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
