"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deleteSupplierAction,
  saveSupplierAction,
  setSupplierActiveAction,
  type SupplierInput,
} from "@/services/products-manager-actions";
import { isOpenPurchaseOrder } from "@/lib/products/procurement";
import { formatDate } from "@/lib/format";
import type { PurchaseOrder, Supplier } from "@/types/business";

const BLANK: SupplierInput = { name: "" };

function fieldsOf(supplier: Supplier | null): SupplierInput {
  if (!supplier) return BLANK;
  return {
    name: supplier.name,
    contactName: supplier.contactName ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    category: supplier.category ?? "",
    leadTimeDays: supplier.leadTimeDays == null ? "" : String(supplier.leadTimeDays),
    paymentTerms: supplier.paymentTerms ?? "",
    notes: supplier.notes ?? "",
  };
}

/**
 * Supplier book for Products Manager → Procurement.
 *
 * Lead time is the only field the app acts on: a purchase order with no
 * expected date gets one from its supplier. Everything else here is contact
 * detail a buyer needs when the delivery does not turn up.
 */
export function SuppliersPanel({
  suppliers,
  purchaseOrders,
  canEdit,
}: {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState<SupplierInput>(BLANK);

  const openCount = (supplierId: string) =>
    purchaseOrders.filter(
      (order) => order.supplierId === supplierId && isOpenPurchaseOrder(order),
    ).length;

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

  function startEdit(supplier: Supplier | null) {
    setEditing(supplier);
    setDraft(fieldsOf(supplier));
    setError(null);
  }

  const set = (key: keyof SupplierInput) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {canEdit ? (
        <Card className="p-4 lg:col-span-2">
          <h2 className="font-semibold">{editing ? "Edit supplier" : "New supplier"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveSupplierAction(editing?.id ?? null, draft),
              );
              if (ok) startEdit(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input
                className="ob-input mt-1 w-full"
                value={draft.name}
                onChange={(e) => set("name")(e.target.value)}
                required
                maxLength={120}
                disabled={pending}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Contact person</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={draft.contactName ?? ""}
                  onChange={(e) => set("contactName")(e.target.value)}
                  maxLength={120}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Category</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={draft.category ?? ""}
                  onChange={(e) => set("category")(e.target.value)}
                  placeholder="Coffee, Dairy, Timber…"
                  maxLength={60}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Phone</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={draft.phone ?? ""}
                  onChange={(e) => set("phone")(e.target.value)}
                  maxLength={40}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Email</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => set("email")(e.target.value)}
                  maxLength={160}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Lead time (days)</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  inputMode="numeric"
                  value={draft.leadTimeDays ?? ""}
                  onChange={(e) => set("leadTimeDays")(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Payment terms</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={draft.paymentTerms ?? ""}
                  onChange={(e) => set("paymentTerms")(e.target.value)}
                  placeholder="Net 15, Cash on delivery…"
                  maxLength={60}
                  disabled={pending}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Notes</span>
              <textarea
                className="ob-input mt-1 w-full"
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) => set("notes")(e.target.value)}
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
                {pending ? "Saving…" : editing ? "Save changes" : "Add supplier"}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm"
                  onClick={() => startEdit(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-[var(--ob-text-muted)] lg:col-span-2">
          Suppliers are an app-level record and can only be written in demo
          workspaces today — the live database has no supplier table yet.
        </Card>
      )}

      <div className="space-y-2 lg:col-span-3">
        {suppliers.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add the businesses you buy from so purchase orders have someone to send to."
          />
        ) : (
          suppliers.map((supplier) => {
            const open = openCount(supplier.id);
            return (
              <div key={supplier.id} className="ob-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {supplier.name}
                    {!supplier.is_active ? (
                      <Badge tone="neutral" className="ml-2">
                        Inactive
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-[var(--ob-text-muted)]">
                    {[supplier.category, supplier.contactName, supplier.phone, supplier.email]
                      .filter(Boolean)
                      .join(" · ") || "No contact details recorded"}
                  </p>
                  <p className="text-xs text-[var(--ob-text-muted)]">
                    {supplier.leadTimeDays == null
                      ? "No lead time set"
                      : `${supplier.leadTimeDays}-day lead time`}
                    {supplier.paymentTerms ? ` · ${supplier.paymentTerms}` : ""} ·{" "}
                    {open} open order{open === 1 ? "" : "s"} · added{" "}
                    {formatDate(supplier.created_at)}
                  </p>
                  {supplier.notes ? (
                    <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                      {supplier.notes}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      onClick={() => startEdit(supplier)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => setSupplierActiveAction(supplier.id, !supplier.is_active))
                      }
                    >
                      {supplier.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      disabled={pending}
                      onClick={() => run(() => deleteSupplierAction(supplier.id))}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
