"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StockAdjustmentPanel } from "@/components/products/stock-adjustment-panel";
import { setReorderLevelAction } from "@/services/products-manager-actions";
import {
  STOCK_FILTERS,
  deadStockCandidates,
  lowStockAlerts,
  reorderSuggestion,
  skusByStatus,
  stockRows,
  summarizeInventory,
  type StockFilter,
  type StockMovement,
  type StockStatus,
} from "@/lib/products/inventory";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { productStock } from "@/lib/business/overview";
import type { Product, StockAdjustment } from "@/types/database";

const STATUS_TONES: Record<StockStatus, "success" | "warning" | "danger" | "neutral"> = {
  ok: "success",
  low: "warning",
  out: "danger",
  untracked: "neutral",
};

const STATUS_LABELS: Record<StockStatus, string> = {
  ok: "In stock",
  low: "Low stock",
  out: "Out of stock",
  untracked: "No reorder level",
};

const FILTER_LABELS: Record<StockFilter, string> = {
  all: "All",
  low: "Low",
  out: "Out",
  untracked: "Untracked",
};

function MovementList({
  movements,
  limit,
}: {
  movements: StockMovement[];
  limit: number;
}) {
  if (movements.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
        No movements recorded yet.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {movements.slice(0, limit).map((row) => (
        <li key={row.id} className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            {row.productName}
            <span className="text-[var(--ob-text-muted)]">{" · "}{row.reason}</span>
          </span>
          <span className="shrink-0 text-[var(--ob-text-muted)]">
            <span className={row.delta < 0 ? "text-[var(--ob-danger)]" : "text-[var(--ob-success)]"}>
              {row.delta > 0 ? "+" : ""}
              {row.delta}
            </span>{" "}
            · {formatDate(row.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reorder level for one line. Remounted per product (`key`) so the draft always
 * starts from the line that is actually selected.
 */
function ReorderLevelEditor({ product }: { product: Product }) {
  const router = useRouter();
  const [value, setValue] = useState(
    product.low_stock_threshold == null ? "" : String(product.low_stock_threshold),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await setReorderLevelAction(product.id, value);
      if (!result.ok) setError(result.message ?? "Could not save the reorder level.");
      else router.refresh();
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <label className="block text-sm">
        <span className="font-medium">Reorder level</span>
        <span className="flex gap-2 mt-1">
          <input
            className="ob-input w-full"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            placeholder="Not set"
          />
          <button
            type="submit"
            className="ob-touch-target shrink-0 rounded-md border border-[var(--ob-border)] px-3 text-sm font-medium disabled:opacity-50"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </span>
      </label>
      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
        Stock at or below this level counts as low. Clear the field to stop
        tracking this line.
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Stock book for the Products Manager: what is on the shelf, which lines need
 * reordering, and the movements that got them there.
 *
 * Counts use the shared rollups in `lib/business/overview`, so a line counted
 * as low here is the same line counted on `/manager/products` and `/manager`.
 * A line with no reorder level is `untracked`: it holds stock but the app has
 * no level to warn against, which is the state every seeded catalogue starts in
 * until a level is set or a purchase order is received.
 */
export function InventoryPanel({
  products,
  movements,
  adjustments,
  soldIds,
  currencyCode,
  canEdit,
}: {
  products: Product[];
  movements: StockMovement[];
  adjustments: StockAdjustment[];
  soldIds: ReadonlySet<string>;
  currencyCode: string;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = stockRows(products, filter);
  const summary = summarizeInventory(products);
  const alerts = lowStockAlerts(products);
  const deadStock = deadStockCandidates(products, soldIds);
  const counts = skusByStatus(products);
  const money = (value: number) => formatMoney(value, currencyCode);

  const selected =
    products.find((p) => p.id === selectedId) ?? rows[0]?.product ?? products[0] ?? null;
  const selectedMoves = selected
    ? movements.filter((m) => m.productId === selected.id)
    : [];
  const selectedAdjustments = selected
    ? adjustments.filter((a) => a.product_id === selected.id)
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Stock on hand</h2>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {summary.units} units · {money(summary.costValue)} at cost ·{" "}
                {money(summary.retailValue)} at retail price
              </p>
            </div>
            <SegmentedControl
              label="Stock filter"
              value={filter}
              onChange={setFilter}
              options={STOCK_FILTERS.map((id) => ({
                id,
                label: `${FILTER_LABELS[id]} (${counts[id]})`,
              }))}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
            {summary.untracked} of {summary.skus} lines have no reorder level, so
            they cannot be low or out.
          </p>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title="No stock lines match this filter"
            description={
              products.length
                ? "Switch back to All to see the whole catalogue."
                : "Add products in the Catalogue to start tracking stock."
            }
          />
        ) : (
          <Card className="ob-scroll-x overflow-x-auto p-0">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">
                Stock level, reorder level and status per product
              </caption>
              <thead>
                <tr className="bg-[var(--ob-surface-muted)] text-left">
                  <th className="p-2 font-medium">Product</th>
                  <th className="p-2 text-right font-medium">Stock</th>
                  <th className="p-2 text-right font-medium">Reorder level</th>
                  <th className="p-2 text-left font-medium">Status</th>
                  <th className="p-2 text-right font-medium">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product, status }) => (
                  <tr
                    key={product.id}
                    className="border-t border-[var(--ob-border)]"
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(product.id)}
                        aria-current={selected?.id === product.id ? "true" : undefined}
                        className="ob-touch-target rounded-[var(--ob-radius-md)] px-1 text-left font-medium hover:text-[var(--ob-primary)]"
                      >
                        {product.name}
                        <span className="block text-xs font-normal text-[var(--ob-text-muted)]">
                          {product.sku ?? product.category ?? "No category"}
                          {!product.is_active ? " · inactive" : ""}
                        </span>
                      </button>
                    </td>
                    <td className="p-2 text-right">
                      {formatQuantity(productStock(product), product.unit)}
                    </td>
                    <td className="p-2 text-right text-[var(--ob-text-muted)]">
                      {product.low_stock_threshold ?? "—"}
                    </td>
                    <td className="p-2">
                      <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
                    </td>
                    <td className="p-2 text-right">
                      {reorderSuggestion(product) > 0 ? (
                        <span className="font-medium">{reorderSuggestion(product)}</span>
                      ) : (
                        <span className="text-[var(--ob-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Recent movements</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Manual adjustments plus the quantity each billed order took off the
            shelf.
          </p>
          <MovementList movements={movements} limit={12} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Low-stock alerts</h2>
          {alerts.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Nothing is at or below its reorder level.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {alerts.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(product.id);
                      setFilter("all");
                    }}
                    className="ob-touch-target w-full rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2 text-left text-sm"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{product.name}</span>
                      <span className="shrink-0">
                        {productStock(product)} / {product.low_stock_threshold}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--ob-text-muted)]">
                      Order {reorderSuggestion(product)} more to get back above the
                      level
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card className="p-4">
            <h2 className="font-semibold">{selected.name}</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              {formatQuantity(productStock(selected), selected.unit)} on hand ·{" "}
              {money(selected.price)} retail
              {selected.cost_price != null
                ? ` · ${money(selected.cost_price)} cost`
                : ""}
            </p>
            <MovementList movements={selectedMoves} limit={6} />
            {canEdit ? <ReorderLevelEditor key={selected.id} product={selected} /> : null}
            {canEdit ? (
              <StockAdjustmentPanel
                key={`adjust-${selected.id}`}
                productId={selected.id}
                recent={selectedAdjustments}
              />
            ) : null}
          </Card>
        ) : null}

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Dead stock</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Active lines holding stock that no order in the demo history sold.
          </p>
          {deadStock.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Every stocked line appears in at least one order.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {deadStock.map((product) => (
                <li key={product.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{product.name}</span>
                  <span className="shrink-0 text-[var(--ob-text-muted)]">
                    {productStock(product)} units
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
