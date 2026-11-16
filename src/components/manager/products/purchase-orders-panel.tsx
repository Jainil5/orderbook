"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  receivePurchaseOrderAction,
  savePurchaseOrderAction,
  setPurchaseOrderStatusAction,
} from "@/services/products-manager-actions";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUSES,
  isOpenPurchaseOrder,
  isPurchaseOrderOverdue,
  linePendingQty,
  lineTotal,
  nextPurchaseOrderStatus,
  purchaseOrderTotals,
} from "@/lib/products/procurement";
import { formatMoney } from "@/lib/format";
import type { PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/types/business";
import type { Product } from "@/types/database";

const STATUS_TONES: Record<PurchaseOrderStatus, "neutral" | "warning" | "danger" | "success"> = {
  draft: "neutral",
  ordered: "warning",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

type LineDraft = { productId: string; qty: string; unitCost: string };

type OrderDraft = {
  supplierId: string;
  expectedOn: string;
  notes: string;
  lines: LineDraft[];
};

function emptyDraft(supplierId: string): OrderDraft {
  return {
    supplierId,
    expectedOn: "",
    notes: "",
    lines: [{ productId: "", qty: "1", unitCost: "" }],
  };
}

function draftOf(order: PurchaseOrder): OrderDraft {
  return {
    supplierId: order.supplierId ?? "",
    expectedOn: order.expectedOn ?? "",
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      productId: line.productId ?? "",
      qty: String(line.qty),
      unitCost: String(line.unitCost),
    })),
  };
}

/**
 * Purchase orders for Products Manager → Procurement.
 *
 * The panel only moves orders along the flow that `lib/products/procurement.ts`
 * allows (draft → ordered → partially_received → received, cancelled from
 * anything open). Receiving is the one step that also touches stock: the action
 * books a stock adjustment per line, so Inventory is up to date as soon as a
 * delivery is confirmed here.
 */
export function PurchaseOrdersPanel({
  orders,
  suppliers,
  products,
  currencyCode,
  today,
  canEdit,
}: {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  products: Product[];
  currencyCode: string;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrderDraft>(() =>
    emptyDraft(suppliers.find((s) => s.is_active)?.id ?? suppliers[0]?.id ?? ""),
  );
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string[]>([]);

  const money = (value: number) => formatMoney(value, currencyCode);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const supplierName = (id: string | null) =>
    id ? (supplierById.get(id)?.name ?? "Removed supplier") : "No supplier yet";
  const productById = new Map(products.map((p) => [p.id, p]));

  const visible = orders
    .filter((order) => statusFilter === "all" || order.status === statusFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openOrders = orders.filter(isOpenPurchaseOrder);
  const openValue = openOrders.reduce(
    (total, order) => total + purchaseOrderTotals(order).cost,
    0,
  );
  const overdue = openOrders.filter((order) => isPurchaseOrderOverdue(order, today));

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startNew() {
    setEditingId("__new__");
    setDraft(emptyDraft(suppliers.find((s) => s.is_active)?.id ?? suppliers[0]?.id ?? ""));
    setError(null);
  }

  function startEdit(order: PurchaseOrder) {
    setEditingId(order.id);
    setDraft(draftOf(order));
    setReceivingId(null);
    setError(null);
  }

  function closeForm() {
    setEditingId(null);
    setError(null);
  }

  function setLine(index: number, patch: Partial<LineDraft>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function pickProduct(index: number, productId: string) {
    const cost = productById.get(productId)?.cost_price;
    setLine(index, {
      productId,
      unitCost: cost != null && cost > 0 ? String(cost) : "",
    });
  }

  function openReceive(order: PurchaseOrder) {
    setReceivingId(order.id);
    setReceipt(order.lines.map((line) => String(linePendingQty(line))));
    setError(null);
  }

  function submitOrder() {
    return run(() =>
      savePurchaseOrderAction(editingId && editingId !== "__new__" ? editingId : null, {
        supplierId: draft.supplierId,
        expectedOn: draft.expectedOn,
        notes: draft.notes,
        lines: draft.lines.map((line) => ({
          productId: line.productId || null,
          name: "",
          qty: line.qty,
          unitCost: line.unitCost,
        })),
      }),
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Purchase orders</h2>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {openOrders.length} open · {money(openValue)} ordered
                {overdue.length > 0
                  ? ` · ${overdue.length} past the expected date`
                  : ""}
              </p>
            </div>
            <label className="block text-sm">
              <span className="sr-only">Filter by status</span>
              <select
                className="ob-input w-full min-w-[11rem]"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as PurchaseOrderStatus | "all")
                }
              >
                <option value="all">All statuses</option>
                {PURCHASE_ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PURCHASE_ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {canEdit && editingId === null ? (
            <button
              type="button"
              onClick={startNew}
              className="ob-touch-target mt-3 rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white"
            >
              New purchase order
            </button>
          ) : null}
        </Card>

        {canEdit && editingId !== null ? (
          <Card className="p-4">
            <h2 className="font-semibold">
              {editingId === "__new__" ? "New purchase order" : "Edit draft order"}
            </h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await submitOrder()) closeForm();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Supplier</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={draft.supplierId}
                    onChange={(e) =>
                      setDraft((current) => ({ ...current, supplierId: e.target.value }))
                    }
                    disabled={pending || suppliers.length === 0}
                  >
                    <option value="">No supplier yet</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {!supplier.is_active ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Expected by</span>
                  <input
                    className="ob-input mt-1 w-full"
                    type="date"
                    value={draft.expectedOn}
                    onChange={(e) =>
                      setDraft((current) => ({ ...current, expectedOn: e.target.value }))
                    }
                    disabled={pending}
                  />
                </label>
              </div>
              <p className="text-xs text-[var(--ob-text-muted)]">
                Leave the date empty to fall back on the supplier&apos;s lead time.
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">Lines</p>
                {draft.lines.map((line, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <label className="block min-w-[10rem] flex-1 text-sm">
                      <span className="text-[var(--ob-text-muted)]">
                        Product{index === 0 ? "" : ` ${index + 1}`}
                      </span>
                      <select
                        className="ob-input mt-1 w-full"
                        value={line.productId}
                        onChange={(e) => pickProduct(index, e.target.value)}
                        disabled={pending}
                      >
                        <option value="">Pick a product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block w-20 text-sm">
                      <span className="text-[var(--ob-text-muted)]">Qty</span>
                      <input
                        className="ob-input mt-1 w-full"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(e) => setLine(index, { qty: e.target.value })}
                        disabled={pending}
                      />
                    </label>
                    <label className="block w-28 text-sm">
                      <span className="text-[var(--ob-text-muted)]">Unit cost</span>
                      <input
                        className="ob-input mt-1 w-full"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={line.unitCost}
                        onChange={(e) => setLine(index, { unitCost: e.target.value })}
                        disabled={pending}
                      />
                    </label>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      disabled={pending || draft.lines.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          lines: current.lines.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                  disabled={pending || draft.lines.length >= 40}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      lines: [...current.lines, { productId: "", qty: "1", unitCost: "" }],
                    }))
                  }
                >
                  Add line
                </button>
              </div>

              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Notes</span>
                <textarea
                  className="ob-input mt-1 w-full"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((current) => ({ ...current, notes: e.target.value }))
                  }
                  maxLength={500}
                  disabled={pending}
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-[var(--ob-danger)]">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm"
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState
            title={
              orders.length
                ? "No orders with this status"
                : "No purchase orders yet"
            }
            description={
              orders.length
                ? "Switch the status filter to see the rest of the purchasing history."
                : "Raise a draft order, add the lines you need, then place it with the supplier."
            }
          />
        ) : (
          visible.map((order) => {
            const totals = purchaseOrderTotals(order);
            const supplier = order.supplierId
              ? (supplierById.get(order.supplierId) ?? null)
              : null;
            const isOverdue = isPurchaseOrderOverdue(order, today);
            const advance = nextPurchaseOrderStatus(order.status);
            const receiving = receivingId === order.id;
            return (
              <div key={order.id} className="ob-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {order.poNumber}
                      <Badge tone={STATUS_TONES[order.status]} className="ml-2">
                        {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      {isOverdue ? (
                        <Badge tone="danger" className="ml-2">
                          Overdue
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {supplierName(order.supplierId)} · {totals.lines} line
                      {totals.lines === 1 ? "" : "s"} · {totals.units} units ·{" "}
                      {money(totals.cost)}
                    </p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {order.expectedOn
                        ? `Expected ${order.expectedOn}`
                        : supplier?.leadTimeDays != null
                          ? `${supplier.leadTimeDays}-day lead time, no date set`
                          : "No expected date"}
                      {totals.outstandingUnits > 0
                        ? ` · ${totals.receivedUnits}/${totals.units} received`
                        : ""}
                    </p>
                    {order.notes ? (
                      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">{order.notes}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {order.status === "draft" ? (
                        <>
                          <button
                            type="button"
                            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                            disabled={pending}
                            onClick={() => startEdit(order)}
                          >
                            Edit
                          </button>
                          {advance ? (
                            <button
                              type="button"
                              className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50"
                              disabled={pending}
                              onClick={() =>
                                run(() => setPurchaseOrderStatusAction(order.id, advance))
                              }
                            >
                              Place order
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {isOpenPurchaseOrder(order) ? (
                        <button
                          type="button"
                          className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50"
                          disabled={pending}
                          onClick={() =>
                            receiving ? setReceivingId(null) : openReceive(order)
                          }
                        >
                          {receiving ? "Close receiving" : "Receive stock"}
                        </button>
                      ) : null}
                      {isOpenPurchaseOrder(order) || order.status === "draft" ? (
                        <button
                          type="button"
                          className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                          disabled={pending}
                          onClick={() =>
                            run(() => setPurchaseOrderStatusAction(order.id, "cancelled"))
                          }
                        >
                          Cancel order
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {order.lines.map((line, index) => (
                    <li
                      key={`${line.productId ?? line.name}-${index}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        {line.name}
                        {line.receivedQty > 0 ? (
                          <span className="text-[var(--ob-text-muted)]">
                            {" "}
                            · {line.receivedQty}/{line.qty} received
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[var(--ob-text-muted)]">
                        {line.qty} × {money(line.unitCost)} = {money(lineTotal(line))}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-3 h-2 rounded-full bg-[var(--ob-surface-muted)]"
                  aria-hidden
                >
                  <div
                    className="h-2 rounded-full bg-[var(--ob-primary)]"
                    style={{ width: `${totals.progressPercent}%` }}
                  />
                </div>

                {receiving ? (
                  <form
                    className="mt-3 space-y-2 border-t border-[var(--ob-border)] pt-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const quantities = receipt.map((value) => Number(value) || 0);
                      const ok = await run(() =>
                        receivePurchaseOrderAction(order.id, quantities),
                      );
                      if (ok) setReceivingId(null);
                    }}
                  >
                    <p className="text-sm font-medium">What arrived?</p>
                    {order.lines.map((line, index) => (
                      <label
                        key={`receive-${index}`}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {line.name}
                          <span className="text-[var(--ob-text-muted)]">
                            {" "}
                            · {linePendingQty(line)} still owed
                          </span>
                        </span>
                        <input
                          className="ob-input w-24 shrink-0"
                          type="number"
                          min="0"
                          max={linePendingQty(line)}
                          step="1"
                          inputMode="numeric"
                          aria-label={`Quantity received for ${line.name}`}
                          value={receipt[index] ?? ""}
                          onChange={(e) =>
                            setReceipt((current) =>
                              current.map((value, i) =>
                                i === index ? e.target.value : value,
                              ),
                            )
                          }
                          disabled={pending}
                        />
                      </label>
                    ))}
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      Receiving adds these quantities to stock and logs a stock
                      adjustment per line.
                    </p>
                    {error ? (
                      <p role="alert" className="text-sm text-[var(--ob-danger)]">
                        {error}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                      disabled={pending}
                    >
                      {pending ? "Saving…" : "Confirm receipt"}
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">How the flow works</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-[var(--ob-text-muted)]">
            <li>1. Draft the order and add its lines — drafts change freely.</li>
            <li>2. Place it. From here the lines are a record of what was bought.</li>
            <li>3. Receive what arrives; partial deliveries keep the order open.</li>
            <li>4. Once every line is in, the order closes itself.</li>
          </ol>
          <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
            A cancelled order leaves stock untouched — receive the goods first if
            they actually arrived.
          </p>
        </Card>
        {overdue.length > 0 ? (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Past the expected date</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {overdue.map((order) => (
                <li key={order.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {order.poNumber}
                    <span className="text-[var(--ob-text-muted)]">
                      {" · "}
                      {supplierName(order.supplierId)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--ob-text-muted)]">
                    {order.expectedOn}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              Expected dates come from the order, or from the supplier&apos;s lead
              time when the buyer left the date blank.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
