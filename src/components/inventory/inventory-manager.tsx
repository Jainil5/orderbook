"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type {
  InventoryAdjustment,
  InventoryAdjustmentKind,
  InventoryItem,
  InventoryStorage,
  Product,
  ProductIngredient,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/cn";
import { formatMoney, formatDate } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";
import { clampNotes } from "@/lib/marketing/script";
import {
  recordInventoryMovementAction,
  saveInventoryItemAction,
} from "@/services/inventory-actions";
import { formatUnitCount, type InventoryPosition, type UsageRow } from "@/lib/inventory/stock";
import {
  recentlyRestocked,
  restockQueue,
  type RecentRestock,
} from "@/lib/inventory/availability";

type WindowDays = "7" | "30" | "90";

type ItemForm = {
  id: string | null;
  name: string;
  category: string;
  unit: string;
  units_per_pack: string;
  cost_per_pack: string;
  stock_packs: string;
  low_stock_packs: string;
  storage: InventoryStorage;
  note: string;
};

const EMPTY_ITEM: ItemForm = {
  id: null,
  name: "",
  category: "",
  unit: "",
  units_per_pack: "",
  cost_per_pack: "",
  stock_packs: "",
  low_stock_packs: "",
  storage: "ambient",
  note: "",
};

const STORAGE_OPTIONS: { id: InventoryStorage; label: string }[] = [
  { id: "ambient", label: "Ambient" },
  { id: "dry", label: "Dry store" },
  { id: "refrigerated", label: "Refrigerated" },
  { id: "frozen", label: "Frozen" },
  { id: "flammable", label: "Flammable" },
];

const KIND_LABEL: Record<InventoryAdjustmentKind, string> = {
  purchase: "Purchased in",
  waste: "Wastage",
  issue: "Consumed",
  stock_count: "Stock count",
};

const KIND_TONE: Record<
  InventoryAdjustmentKind,
  "success" | "warning" | "neutral" | "danger"
> = {
  purchase: "success",
  waste: "danger",
  issue: "warning",
  stock_count: "neutral",
};

/** Packs are fractional once sales start eating them: 0.33 pack, not 0 pack. */
function formatPacks(packs: number): string {
  return packs % 1 === 0 ? String(packs) : packs.toFixed(2).replace(/0+$/, "");
}

function statusBadge(status: InventoryPosition["status"]) {
  if (status === "out") return <Badge tone="danger">Out of stock</Badge>;
  if (status === "low") return <Badge tone="warning">Reorder</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

export function InventoryManager({
  positions,
  ingredients,
  ledger,
  usage,
  usageCost,
  windowDays,
  orderCount,
  products,
  currencyCode,
}: {
  positions: InventoryPosition[];
  ingredients: ProductIngredient[];
  ledger: InventoryAdjustment[];
  usage: UsageRow[];
  usageCost: number;
  windowDays: number;
  orderCount: number;
  /** The whole menu, active or not — a recipe may sit on a retired product. */
  products: Product[];
  currencyCode: string;
}) {
  const router = useRouter();
  const mounted = useMounted();
  /** The clock the "just landed" window is measured back from, kept in state so
   *  render stays pure and the window still slides while the screen is open. */
  const [clock, setClock] = useState(() => Date.now());
  const itemDialogRef = useRef<HTMLDialogElement>(null);
  const moveDialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_ITEM);
  const [itemError, setItemError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [move, setMove] = useState({
    itemId: "",
    kind: "purchase" as InventoryAdjustmentKind,
    packs: "",
    cost: "",
    note: "",
  });
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const itemNames = useMemo(
    () => new Map(positions.map((row) => [row.item.id, row.item.name])),
    [positions],
  );

  /** The stock rows themselves — a position already carries its item. */
  const items = useMemo(() => positions.map((row) => row.item), [positions]);
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  /** Which menu items drain which stock — the join the merchant never has to write. */
  const usedIn = useMemo(() => {
    const names = new Map(products.map((p) => [p.id, p.name]));
    const byItem = new Map<string, string[]>();
    for (const row of ingredients) {
      const name = names.get(row.product_id);
      if (!name) continue;
      const list = byItem.get(row.item_id) ?? [];
      if (!list.includes(name)) list.push(name);
      byItem.set(row.item_id, list);
    }
    return byItem;
  }, [ingredients, products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of positions) set.add(row.item.category ?? "Uncategorized");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [positions]);

  const rows = positions.filter(
    (row) => category === "all" || (row.item.category ?? "Uncategorized") === category,
  );

  const totals = useMemo(() => {
    let value = 0;
    let low = 0;
    let tracked = 0;
    for (const row of positions) {
      value += row.value;
      if (row.status !== "ok") low += 1;
      if (usedIn.has(row.item.id)) tracked += 1;
    }
    return { value, low, tracked };
  }, [positions, usedIn]);

  function openItem(row?: InventoryItem) {
    setItemError(null);
    setForm(
      row
        ? {
            id: row.id,
            name: row.name,
            category: row.category ?? "",
            unit: row.unit,
            units_per_pack: String(row.units_per_pack),
            cost_per_pack: String(row.cost_per_pack),
            stock_packs: String(row.stock_packs),
            low_stock_packs: String(row.low_stock_packs),
            storage: row.storage ?? "ambient",
            note: row.note ?? "",
          }
        : EMPTY_ITEM,
    );
    itemDialogRef.current?.showModal();
  }

  function openMovement(row: InventoryItem, packs?: number) {
    setMoveError(null);
    setMove({
      itemId: row.id,
      kind: "purchase",
      packs: packs != null && Number.isFinite(packs) ? String(packs) : "",
      cost: "",
      note: "",
    });
    moveDialogRef.current?.showModal();
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setItemError(null);
    const result = await saveInventoryItemAction(form.id, {
      name: form.name,
      category: form.category || null,
      unit: form.unit,
      units_per_pack: form.units_per_pack,
      cost_per_pack: form.cost_per_pack,
      stock_packs: form.stock_packs,
      low_stock_packs: form.low_stock_packs,
      storage: form.storage,
      note: form.note || null,
    });
    setSaving(false);
    if (!result.ok) {
      setItemError(result.error);
      return;
    }
    itemDialogRef.current?.close();
    router.refresh();
  }

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (moving) return;
    setMoving(true);
    setMoveError(null);
    const result = await recordInventoryMovementAction({
      itemId: move.itemId,
      deltaPacks: move.kind === "purchase" ? Number(move.packs) : -Math.abs(Number(move.packs)),
      kind: move.kind,
      cost: move.kind === "purchase" && move.cost !== "" ? Number(move.cost) : null,
      note: move.note || null,
    });
    setMoving(false);
    if (!result.ok) {
      setMoveError(result.error);
      return;
    }
    moveDialogRef.current?.close();
    router.refresh();
  }

  const movedItem = itemNames.get(move.itemId);
  const outOfStock = positions.filter((row) => row.status === "out");

  /**
   * The buy list, worst first: everything finished, then everything past its
   * own reorder line. `restockQueue` does the ordering and the suggested packs;
   * the recipe context is what lets an alert say which menu items are at risk
   * rather than just naming a bag of something.
   */
  const buyList = useMemo(
    () => restockQueue(items, positions, { ingredients, products }),
    [items, positions, ingredients, products],
  );

  /**
   * Deliveries inside the same window the usage figures use. Gated on mount
   * because the window is measured from the wall clock, and a server render
   * would answer for a different moment than the phone in someone's hand.
   */
  const landed = useMemo(
    () =>
      mounted
        ? recentlyRestocked(items, ledger, positions, {
            withinDays: windowDays,
            now: clock,
          })
        : [],
    [mounted, items, ledger, positions, windowDays, clock],
  );

  /** Which live menu item a restock is worth announcing on. */
  const announceProduct = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const first = new Map<string, Product>();
    for (const row of ingredients) {
      if (first.has(row.item_id)) continue;
      const product = byId.get(row.product_id);
      if (product?.is_active) first.set(row.item_id, product);
    }
    return first;
  }, [ingredients, products]);

  function announceHref(alert: RecentRestock, product: Product): string {
    const outFor =
      alert.wasOutForDays == null
        ? ""
        : ` after ${alert.wasOutForDays} day${alert.wasOutForDays === 1 ? "" : "s"} out`;
    const params = new URLSearchParams({
      product: product.id,
      objective: "content",
      kind: "reel",
      seconds: "7",
      notes: clampNotes(
        `${alert.name} is back on the shelf${outFor}. Tell the people who kept asking for ${product.name}.`,
      ),
    });
    return `/marketing/content?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Stock value"
          value={formatMoney(totals.value, currencyCode)}
          hint={`${positions.length} items tracked`}
        />
        <Stat
          label="Needs reorder"
          value={String(totals.low)}
          hint={totals.low ? "At or below the reorder line" : "Shelf is healthy"}
          tone={totals.low ? "warning" : "ok"}
        />
        <Stat
          label={`Used in ${windowDays} days`}
          value={formatMoney(usageCost, currencyCode)}
          hint={`${orderCount} bills · derived from recipes`}
        />
        <Stat
          label="Recipes linked"
          value={`${totals.tracked}/${positions.length}`}
          hint="Stock items a product consumes"
        />
      </div>

      {outOfStock.length ? (
        <p className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-[var(--ob-surface-muted)] px-4 py-3 text-sm">
          <span className="font-semibold">
            {outOfStock.length} item{outOfStock.length === 1 ? "" : "s"} finished:
          </span>{" "}
          {outOfStock.map((row) => row.item.name).join(", ")} — sales still price
          correctly, but the shelf count cannot go below zero.
        </p>
      ) : null}

      {buyList.length || landed.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ob-card p-4 sm:p-5">
            <h2 className="font-semibold">Buy list</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Finished first, then whatever has slipped past its own reorder
              line. The packs suggested bring the shelf back to that line plus
              one.
            </p>
            {buyList.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
                Nothing to order. Every shelf is above its line.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {buyList.slice(0, 6).map((alert) => {
                  const item = itemById.get(alert.itemId);
                  return (
                    <li
                      key={alert.itemId}
                      className="rounded-[var(--ob-radius-sm)] border border-[var(--ob-border)] p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{alert.name}</p>
                          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                            {formatPacks(alert.packsOnShelf)} {alert.unit} packs
                            on the shelf · reorder at{" "}
                            {formatPacks(alert.reorderAt)}
                          </p>
                        </div>
                        <Badge tone={alert.status === "out" ? "danger" : "warning"}>
                          {alert.status === "out" ? "Finished" : "Reorder"}
                        </Badge>
                      </div>
                      {alert.drainsProducts.length ? (
                        <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
                          Puts at risk: {alert.drainsProducts.slice(0, 3).join(", ")}
                          {alert.drainsProducts.length > 3
                            ? ` +${alert.drainsProducts.length - 3} more`
                            : ""}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!item}
                          onClick={() =>
                            item && openMovement(item, alert.suggestedPacks)
                          }
                        >
                          Buy {alert.suggestedPacks} pack
                          {alert.suggestedPacks === 1 ? "" : "s"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ob-card p-4 sm:p-5">
            <h2 className="font-semibold">Just landed</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              A delivery inside the same {windowDays}-day window the usage above
              covers, after the shelf sat empty. This is the moment to tell the
              people who asked.
            </p>
            {landed.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
                No restock has landed in this window, so there is nothing to
                announce yet. Recording a purchase here is what puts a delivery
                on this list — and the shelf it refills is what the buy list
                above is asking for.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {landed.slice(0, 5).map((restock) => {
                  const product = announceProduct.get(restock.itemId);
                  const unit = itemById.get(restock.itemId)?.unit ?? "";
                  return (
                    <li
                      key={restock.itemId}
                      className="rounded-[var(--ob-radius-sm)] border border-[var(--ob-border)] p-3"
                    >
                      <p className="font-medium">{restock.name}</p>
                      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                        {formatUnitCount(restock.unitsAdded, unit)} back on{" "}
                        {formatDate(restock.restockedAt)}
                        {restock.wasOutForDays != null && restock.wasOutForDays > 0
                          ? ` · the shelf was empty for ${restock.wasOutForDays} day${restock.wasOutForDays === 1 ? "" : "s"}`
                          : ""}
                      </p>
                      {product ? (
                        <Link
                          href={announceHref(restock, product)}
                          className="mt-2 inline-block text-sm font-semibold text-[var(--ob-primary)] underline underline-offset-2"
                        >
                          Announce it is back on {product.name} →
                        </Link>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
                          No live menu item uses this, so there is nothing to
                          announce.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--ob-text-muted)]">Category</span>
          <select
            aria-label="Inventory category"
            className="ob-input w-[15rem] max-w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => openItem()}>
          <Plus size={16} aria-hidden />
          Add stock item
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No stock items yet"
          description="Add what you buy in packs — bread by the slice, coffee by the glass, plywood by the square foot — and every bill can draw them down."
        />
      ) : (
        <div className="ob-scroll-x overflow-x-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)]">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-[var(--ob-surface-muted)] text-left text-[11px] uppercase tracking-[0.12em] text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Pack size</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Used in</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ob-border)]">
              {rows.map((row) => (
                <tr key={row.item.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--ob-text)]">
                      {row.item.name}
                    </p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {row.item.category ?? "Uncategorized"}
                      {row.item.storage ? ` · ${row.item.storage}` : ""}
                      {row.item.note ? ` · ${row.item.note}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUnitCount(row.item.units_per_pack, row.item.unit)}
                    <span className="text-xs text-[var(--ob-text-muted)]">
                      {" "}
                      / pack
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatPacks(row.packs)} packs
                    <span className="block text-xs text-[var(--ob-text-muted)]">
                      ≈ {formatUnitCount(row.units, row.item.unit)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMoney(row.item.cost_per_pack, currencyCode)}
                    <span className="block text-xs text-[var(--ob-text-muted)]">
                      {formatMoney(row.costPerUnit, currencyCode)} /{" "}
                      {row.item.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMoney(row.value, currencyCode)}
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(row.status)}
                    {row.shortBy > 0 ? (
                      <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                        {formatPacks(row.shortBy)} packs short
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--ob-text-muted)]">
                    {renderUsedIn(usedIn.get(row.item.id))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        variant="secondary"
                        className="px-4 py-1.5 text-[13px]"
                        onClick={() => openMovement(row.item)}
                      >
                        Move stock
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-4 py-1.5 text-[13px]"
                        onClick={() => openItem(row.item)}
                      >
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="ob-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[19px] font-semibold">
              What the bills consumed
            </h2>
            <p className="text-sm text-[var(--ob-text-muted)]">
              Derived from each sold line against its ingredient list — quotes,
              cancellations and credit notes are left out.
            </p>
          </div>
          <SegmentedControl<WindowDays>
            label="Usage window"
            value={String(windowDays) as WindowDays}
            onChange={(next) =>
              router.push(`/products?tab=inventory&window=${next}`)
            }
            options={[
              { id: "7", label: "7 days" },
              { id: "30", label: "30 days" },
              { id: "90", label: "90 days" },
            ]}
          />
        </div>
        {usage.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Nothing consumed in this window. Add ingredient lists to your
            products and every bill will report its own raw cost here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--ob-border)] text-sm">
            {usage.slice(0, 12).map((row) => (
              <li key={row.itemId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {row.itemName}
                </span>
                <span className="tabular-nums text-[var(--ob-text-muted)]">
                  {formatUnitCount(row.units, row.unit)} ·{" "}
                  {formatPacks(row.packs)} packs
                </span>
                <span className="w-24 text-right tabular-nums">
                  {formatMoney(row.cost, currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ob-card space-y-3 p-4">
        <h2 className="font-display text-[19px] font-semibold">Movements</h2>
        <p className="text-sm text-[var(--ob-text-muted)]">
          Purchases in, wastage out, counts to correct the shelf — and a
          Consumed row, noted with its order number, every time a bill drew
          stock down.
        </p>
        {ledger.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            No movements recorded in this browser yet. Save a bill or move stock
            and the trail starts here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--ob-border)] text-sm">
            {ledger.slice(0, 12).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Badge>
                <span className="font-medium">
                  {itemNames.get(row.item_id) ?? "Removed item"}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    row.delta_packs > 0
                      ? "text-[var(--ob-success)]"
                      : "text-[var(--ob-danger)]",
                  )}
                >
                  {row.delta_packs > 0 ? "+" : "−"}
                  {formatPacks(Math.abs(row.delta_packs))} packs
                </span>
                {row.cost ? (
                  <span className="tabular-nums text-[var(--ob-text-muted)]">
                    {formatMoney(row.cost, currencyCode)}
                  </span>
                ) : null}
                {row.note ? (
                  <span className="text-xs text-[var(--ob-text-muted)]">
                    {row.note}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-[var(--ob-text-muted)]">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dialog
        ref={itemDialogRef}
        className={cn(
          "w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-[var(--ob-radius-lg)]",
          "border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)]",
          "backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]",
          "max-sm:w-[calc(100vw-2rem)] max-sm:rounded-[var(--ob-radius-xl)]",
        )}
        onClose={() => setItemError(null)}
      >
        <form onSubmit={saveItem} className="p-6">
          <h2 className="text-lg font-semibold">
            {form.id ? "Edit stock item" : "Add stock item"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Stock is what you buy; products are what you sell. A pack size turns
            “18 slices of bread” into something a bill can consume.
          </p>
          <div className="mt-5 space-y-3">
            <Field label="Name">
              <Input
                aria-label="Stock item name"
                value={form.name}
                placeholder="Multigrain Bread"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Input
                  aria-label="Stock category"
                  value={form.category}
                  placeholder="Bakery"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </Field>
              <Field label="Counted in">
                <Input
                  aria-label="Stock unit"
                  value={form.unit}
                  placeholder="slice"
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Units per pack" hint="1 pack = how many">
                <Input
                  aria-label="Units per pack"
                  type="number"
                  step="0.01"
                  value={form.units_per_pack}
                  placeholder="18"
                  onChange={(e) =>
                    setForm({ ...form, units_per_pack: e.target.value })
                  }
                />
              </Field>
              <Field label="Cost per pack">
                <Input
                  aria-label="Cost per pack"
                  type="number"
                  step="0.01"
                  value={form.cost_per_pack}
                  placeholder="90"
                  onChange={(e) =>
                    setForm({ ...form, cost_per_pack: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Packs on hand">
                <Input
                  aria-label="Packs on hand"
                  type="number"
                  step="1"
                  value={form.stock_packs}
                  placeholder="6"
                  onChange={(e) =>
                    setForm({ ...form, stock_packs: e.target.value })
                  }
                />
              </Field>
              <Field label="Reorder at" hint="packs">
                <Input
                  aria-label="Reorder level"
                  type="number"
                  step="1"
                  value={form.low_stock_packs}
                  placeholder="2"
                  onChange={(e) =>
                    setForm({ ...form, low_stock_packs: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Storage">
              <select
                aria-label="Storage"
                className="ob-input"
                value={form.storage}
                onChange={(e) =>
                  setForm({ ...form, storage: e.target.value as InventoryStorage })
                }
              >
                {STORAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note" hint="optional">
              <Input
                aria-label="Stock note"
                value={form.note}
                placeholder="≈60 glasses per 200 g jar"
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
          </div>
          {itemError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--ob-danger)]">
              {itemError}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => itemDialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save item
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={moveDialogRef}
        className={cn(
          "w-[min(100%,26rem)] max-h-[90vh] overflow-y-auto rounded-[var(--ob-radius-lg)]",
          "border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)]",
          "backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]",
          "max-sm:w-[calc(100vw-2rem)]",
        )}
        onClose={() => setMoveError(null)}
      >
        <form onSubmit={saveMovement} className="p-6">
          <h2 className="text-lg font-semibold">
            Move stock{movedItem ? ` · ${movedItem}` : ""}
          </h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Purchases add packs. Wastage removes them. A stock count enters the
            difference you found. Bill consumption is written for you.
          </p>
          <div className="mt-5 space-y-3">
            <Field label="Movement">
              <select
                aria-label="Movement type"
                className="ob-input"
                value={move.kind}
                onChange={(e) =>
                  setMove({
                    ...move,
                    kind: e.target.value as InventoryAdjustmentKind,
                  })
                }
              >
                {(Object.keys(KIND_LABEL) as InventoryAdjustmentKind[])
                  .filter((kind) => kind !== "issue")
                  .map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Packs" hint={move.kind === "purchase" ? "added" : "removed"}>
              <Input
                aria-label="Packs moved"
                type="number"
                step="0.01"
                min="0"
                value={move.packs}
                placeholder="4"
                onChange={(e) => setMove({ ...move, packs: e.target.value })}
              />
            </Field>
            {move.kind === "purchase" ? (
              <Field label="Amount paid" hint="optional">
                <Input
                  aria-label="Amount paid"
                  type="number"
                  step="0.01"
                  value={move.cost}
                  placeholder={movedItem ? "" : ""}
                  onChange={(e) => setMove({ ...move, cost: e.target.value })}
                />
              </Field>
            ) : null}
            <Field label="Note" hint="supplier, job, reason">
              <Input
                aria-label="Movement note"
                value={move.note}
                placeholder="Weekend supplier delivery"
                onChange={(e) => setMove({ ...move, note: e.target.value })}
              />
            </Field>
          </div>
          {moveError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--ob-danger)]">
              {moveError}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => moveDialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" loading={moving}>
              Record movement
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function renderUsedIn(names: string[] | undefined) {
  if (!names?.length) {
    return <span className="text-[var(--ob-text-muted)]">Not in any recipe</span>;
  }
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - 2;
  return (
    <span>
      {shown}
      {rest > 0 ? ` +${rest} more` : ""}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--ob-text-secondary)]">
        {label}
        {hint ? (
          <span className="ml-1 text-xs text-[var(--ob-text-muted)]">({hint})</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warning" | "ok";
}) {
  return (
    <div className="ob-card p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ob-text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-[22px] font-semibold tabular-nums",
          tone === "warning" ? "text-[var(--ob-warning)]" : "text-[var(--ob-text)]",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">{hint}</p>
    </div>
  );
}
