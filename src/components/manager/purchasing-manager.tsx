"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  VENDOR_PAYMENT_TERM_LABELS,
  lineOutstanding,
  type PurchaseOrderView,
} from "@/lib/procurement/purchasing";
import {
  cancelPurchaseOrderAction,
  createPurchaseOrderAction,
  deletePurchaseOrderAction,
  receivePurchaseOrderLineAction,
  saveVendorAction,
  sendPurchaseOrderAction,
} from "@/services/procurement-actions";
import type { PurchaseOrderStatus, Vendor } from "@/types/procurement";
import { VENDOR_PAYMENT_TERMS } from "@/types/procurement";

export type PurchasingItemOption = {
  id: string;
  name: string;
  unit: string;
  cost_per_pack: number;
};

export type ShortItemOption = PurchasingItemOption & { packs: number };

type Filter = "all" | "draft" | "open" | "late" | "closed";
type LineDraft = { itemId: string; packs: string; costPerPack: string };
type Result = { ok: boolean; message?: string };

const STATUS_TONE: Record<PurchaseOrderStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  sent: "warning",
  partially_received: "warning",
  received: "success",
  cancelled: "danger",
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "open", label: "Awaiting delivery" },
  { key: "late", label: "Late" },
  { key: "closed", label: "Closed" },
];

function matches(view: PurchaseOrderView, filter: Filter): boolean {
  const status = view.po.status;
  if (filter === "all") return true;
  if (filter === "draft") return status === "draft";
  if (filter === "open") return status === "sent" || status === "partially_received";
  if (filter === "late") return view.late;
  return status === "received" || status === "cancelled";
}

export function PurchasingManager({
  views,
  vendors,
  items,
  shortItems,
  canAdd,
}: {
  views: PurchaseOrderView[];
  vendors: Vendor[];
  items: PurchasingItemOption[];
  shortItems: ShortItemOption[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, string>>({});

  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  const [vendorForm, setVendorForm] = useState<Vendor | null>(null);
  const [vName, setVName] = useState("");
  const [vCategory, setVCategory] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vLead, setVLead] = useState("2");
  const [vTerms, setVTerms] = useState<string>("cash");
  const [vRating, setVRating] = useState("");
  const [vNote, setVNote] = useState("");

  async function run(fn: () => Promise<Result>) {
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

  function setLine(index: number, patch: Partial<LineDraft>) {
    setLines((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // Choosing an item carries its last known pack price into the line.
        if (patch.itemId !== undefined && !row.costPerPack) {
          const item = items.find((candidate) => candidate.id === patch.itemId);
          if (item) next.costPerPack = String(item.cost_per_pack);
        }
        return next;
      }),
    );
  }

  function startVendor(vendor: Vendor | null) {
    setVendorForm(vendor);
    setVName(vendor?.name ?? "");
    setVCategory(vendor?.category ?? "");
    setVPhone(vendor?.phone ?? "");
    setVLead(String(vendor?.lead_time_days ?? 2));
    setVTerms(vendor?.payment_terms ?? "cash");
    setVRating(vendor?.rating == null ? "" : String(vendor.rating));
    setVNote(vendor?.note ?? "");
    setError(null);
  }

  const visible = views.filter((view) => matches(view, filter));
  const open = views.filter((view) => matches(view, "open"));
  const lateCount = views.filter((view) => view.late).length;
  const owedPacks = open.reduce((sum, v) => sum + v.totals.outstandingPacks, 0);
  const owedValue = open.reduce((sum, v) => sum + v.totals.outstandingValue, 0);
  const nameOfVendor = (id: string) =>
    vendors.find((vendor) => vendor.id === id)?.name ?? "Unknown vendor";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-[var(--ob-text-muted)]">
            Awaiting delivery
          </p>
          <p className="mt-1 ob-num text-2xl">{open.length}</p>
          <p className="text-sm text-[var(--ob-text-muted)]">
            {owedPacks} packs · {formatMoney(owedValue)} still to arrive
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-[var(--ob-text-muted)]">
            Past their date
          </p>
          <p className="mt-1 ob-num text-2xl">{lateCount}</p>
          <p className="text-sm text-[var(--ob-text-muted)]">
            {lateCount ? "Chase these vendors" : "Nothing overdue"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.13em] text-[var(--ob-text-muted)]">
            Short on the shelf
          </p>
          <p className="mt-1 ob-num text-2xl">{shortItems.length}</p>
          <p className="text-sm text-[var(--ob-text-muted)]">
            {shortItems.length
              ? `${formatMoney(shortItems.reduce((sum, row) => sum + row.packs * row.cost_per_pack, 0))} to cover`
              : "Every item is above its reorder line"}
          </p>
        </Card>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {canAdd ? (
          <Card className="h-fit p-4 lg:col-span-1">
            <h2 className="font-semibold">New purchase order</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() =>
                  createPurchaseOrderAction({
                    vendorId,
                    expectedAt: expectedAt || undefined,
                    note,
                    lines: lines
                      .filter((row) => row.itemId)
                      .map((row) => ({
                        itemId: row.itemId,
                        packs: row.packs,
                        costPerPack: row.costPerPack,
                      })),
                  }),
                );
                if (ok) {
                  setLines([]);
                  setNote("");
                  setExpectedAt("");
                }
              }}
            >
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Vendor</span>
                <select
                  className="ob-input mt-1 w-full"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  disabled={pending || !vendors.length}
                >
                  {vendors.length ? null : <option value="">No vendors yet</option>}
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name} · {vendor.lead_time_days}d lead
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Expected (optional)</span>
                  <input
                    className="ob-input mt-1 w-full"
                    type="date"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                    disabled={pending}
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost w-full rounded-full px-3 text-sm font-semibold disabled:opacity-50"
                    disabled={pending || !shortItems.length}
                    onClick={() =>
                      setLines(
                        shortItems.map((row) => ({
                          itemId: row.id,
                          packs: String(row.packs),
                          costPerPack: String(row.cost_per_pack),
                        })),
                      )
                    }
                  >
                    Fill short items
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-[var(--ob-text-muted)]">Lines</p>
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2">
                    <select
                      className="ob-input col-span-6 text-sm"
                      value={line.itemId}
                      onChange={(e) => setLine(index, { itemId: e.target.value })}
                      disabled={pending}
                      aria-label="Stock item"
                    >
                      <option value="">Choose item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="ob-input col-span-2 text-sm"
                      inputMode="decimal"
                      placeholder="Packs"
                      value={line.packs}
                      onChange={(e) => setLine(index, { packs: e.target.value })}
                      disabled={pending}
                      aria-label="Packs"
                    />
                    <input
                      className="ob-input col-span-3 text-sm"
                      inputMode="decimal"
                      placeholder="₹/pack"
                      value={line.costPerPack}
                      onChange={(e) => setLine(index, { costPerPack: e.target.value })}
                      disabled={pending}
                      aria-label="Cost per pack"
                    />
                    <button
                      type="button"
                      className="ob-touch-target col-span-1 text-sm text-[var(--ob-text-muted)]"
                      aria-label="Remove line"
                      disabled={pending}
                      onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() =>
                    setLines((rows) => [...rows, { itemId: "", packs: "", costPerPack: "" }])
                  }
                >
                  Add line
                </button>
              </div>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={pending}
                />
              </label>
              <button
                type="submit"
                className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={pending || !vendors.length || !lines.some((row) => row.itemId)}
              >
                {pending ? "Saving…" : "Create draft order"}
              </button>
              <p className="text-xs text-[var(--ob-text-muted)]">
                Drafts hold no stock. Nothing moves until the order is sent and the van
                arrives.
              </p>
            </form>
          </Card>
        ) : null}

        <div className={canAdd ? "lg:col-span-2" : "lg:col-span-3"}>
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`ob-touch-target rounded-full border px-3 text-sm ${
                  filter === option.key
                    ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)]"
                    : "border-[var(--ob-border)]"
                }`}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {visible.length === 0 ? (
              <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
                No purchase orders in this view.
              </Card>
            ) : null}
            {visible.map((view) => {
              const openHere = expanded === view.po.id;
              return (
                <Card key={view.po.id} className={`p-4 ${view.late ? "border border-[var(--ob-danger)]!" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {view.po.number}
                        <Badge tone={STATUS_TONE[view.po.status]} className="ml-2">
                          {PURCHASE_ORDER_STATUS_LABELS[view.po.status]}
                        </Badge>
                        {view.late ? (
                          <Badge tone="danger" className="ml-2">
                            Late
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-sm text-[var(--ob-text-muted)]">
                        {nameOfVendor(view.po.vendor_id)} · {view.totals.lines}{" "}
                        {view.totals.lines === 1 ? "line" : "lines"} ·{" "}
                        {view.totals.receivedPacks}/{view.totals.packs} packs ·{" "}
                        {formatMoney(view.totals.value)}
                      </p>
                      {view.po.note ? (
                        <p className="text-sm text-[var(--ob-text-muted)]">{view.po.note}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
                        disabled={pending}
                        onClick={() => setExpanded(openHere ? null : view.po.id)}
                      >
                        {openHere ? "Hide lines" : "Lines"}
                      </button>
                      {view.po.status === "draft" ? (
                        <button
                          type="button"
                          className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                          disabled={pending}
                          onClick={() => run(() => sendPurchaseOrderAction(view.po.id))}
                        >
                          Send to vendor
                        </button>
                      ) : null}
                      {view.po.status !== "received" && view.po.status !== "cancelled" ? (
                        <button
                          type="button"
                          className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                          disabled={pending}
                          onClick={() => run(() => cancelPurchaseOrderAction(view.po.id))}
                        >
                          {view.po.status === "draft"
                            ? "Cancel order"
                            : "Cancel the rest"}
                        </button>
                      ) : null}
                      {(view.po.status === "draft" || view.po.status === "cancelled") && canAdd ? (
                        <button
                          type="button"
                          className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                          disabled={pending}
                          onClick={() => run(() => deletePurchaseOrderAction(view.po.id))}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {openHere ? (
                    <ul className="mt-3 space-y-2 border-t border-[var(--ob-line)] pt-3">
                      {view.lines.map((line) => {
                        const waiting = lineOutstanding(line);
                        return (
                          <li key={line.id} className="text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0">
                                {line.item_name} — {line.received_packs}/{line.packs} packs at{" "}
                                {formatMoney(line.cost_per_pack)}
                              </span>
                              {waiting > 0 &&
                              (view.po.status === "sent" ||
                                view.po.status === "partially_received") ? (
                                <span className="flex items-center gap-1">
                                  <input
                                    className="ob-input w-20 text-sm"
                                    inputMode="decimal"
                                    aria-label={`Packs received of ${line.item_name}`}
                                    placeholder={String(waiting)}
                                    value={receipts[line.id] ?? ""}
                                    onChange={(e) =>
                                      setReceipts((map) => ({ ...map, [line.id]: e.target.value }))
                                    }
                                    disabled={pending}
                                  />
                                  <button
                                    type="button"
                                    className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50"
                                    disabled={pending}
                                    onClick={async () => {
                                      const value = receipts[line.id] ?? "";
                                      const ok = await run(() =>
                                        receivePurchaseOrderLineAction(
                                          view.po.id,
                                          line.id,
                                          value === "" ? waiting : value,
                                        ),
                                      );
                                      if (ok) {
                                        setReceipts((map) => {
                                          const next = { ...map };
                                          delete next[line.id];
                                          return next;
                                        });
                                      }
                                    }}
                                  >
                                    Receive
                                  </button>
                                </span>
                              ) : null}
                              {waiting === 0 ? (
                                <Badge tone="success" className="ml-2">
                                  In full
                                </Badge>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                      {!view.lines.length ? (
                        <li className="text-sm text-[var(--ob-text-muted)]">
                          This order has no lines yet.
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit p-4 lg:col-span-1">
          <h2 className="font-semibold">{vendorForm ? "Edit vendor" : "New vendor"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveVendorAction(vendorForm?.id ?? null, {
                  name: vName,
                  category: vCategory,
                  phone: vPhone,
                  lead_time_days: vLead,
                  payment_terms: vTerms,
                  rating: vRating,
                  note: vNote,
                }),
              );
              if (ok) startVendor(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input
                className="ob-input mt-1 w-full"
                value={vName}
                maxLength={80}
                onChange={(e) => setVName(e.target.value)}
                required
                disabled={pending}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Supplies</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={vCategory}
                  maxLength={40}
                  onChange={(e) => setVCategory(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Phone</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={vPhone}
                  maxLength={20}
                  onChange={(e) => setVPhone(e.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Lead days</span>
                <input
                  className="ob-input mt-1 w-full"
                  inputMode="numeric"
                  value={vLead}
                  onChange={(e) => setVLead(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Terms</span>
                <select
                  className="ob-input mt-1 w-full"
                  value={vTerms}
                  onChange={(e) => setVTerms(e.target.value)}
                  disabled={pending}
                >
                  {VENDOR_PAYMENT_TERMS.map((term) => (
                    <option key={term} value={term}>
                      {VENDOR_PAYMENT_TERM_LABELS[term]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Rating</span>
                <input
                  className="ob-input mt-1 w-full"
                  inputMode="decimal"
                  placeholder="1–5"
                  value={vRating}
                  onChange={(e) => setVRating(e.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
              <input
                className="ob-input mt-1 w-full"
                value={vNote}
                maxLength={200}
                onChange={(e) => setVNote(e.target.value)}
                disabled={pending}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={pending}
              >
                {pending ? "Saving…" : vendorForm ? "Save vendor" : "Add vendor"}
              </button>
              {vendorForm ? (
                <button
                  type="button"
                  className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                  disabled={pending}
                  onClick={() => startVendor(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>

        <div className="space-y-2 lg:col-span-2">
          {vendors.map((vendor) => {
            const theirs = views.filter((view) => view.po.vendor_id === vendor.id);
            const live = theirs.filter(
              (view) => view.po.status === "sent" || view.po.status === "partially_received",
            );
            return (
              <Card key={vendor.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {vendor.name}
                      {vendor.active ? null : (
                        <Badge tone="neutral" className="ml-2">
                          Inactive
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {[
                        vendor.category,
                        `${vendor.lead_time_days}d lead`,
                        VENDOR_PAYMENT_TERM_LABELS[vendor.payment_terms],
                        vendor.rating == null ? null : `${vendor.rating}/5`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {vendor.note ? (
                      <p className="text-sm text-[var(--ob-text-muted)]">{vendor.note}</p>
                    ) : null}
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {live.length ? `${live.length} order(s) awaiting delivery` : "Nothing outstanding"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => startVendor(vendor)}
                  >
                    Edit
                  </button>
                </div>
              </Card>
            );
          })}
          {!vendors.length ? (
            <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
              No vendors yet. Add the shops this brand buys from to start a purchase order.
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
