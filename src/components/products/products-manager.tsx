"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InventoryItem,
  Product,
  ProductIngredient,
  ProductIngredientInput,
  ProductUpsertInput,
  StockAdjustment,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { canManageProducts } from "@/lib/security/validate-product";
import {
  saveProductAction,
  toggleProductActiveAction,
  toggleProductUnavailableAction,
} from "@/services/product-actions";
import {
  saveProductIngredientsAction,
} from "@/services/inventory-actions";
import { Pencil, Plus } from "lucide-react";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { StockAdjustmentPanel } from "@/components/products/stock-adjustment-panel";
import {
  MAX_MODIFIER_GROUPS,
  MAX_MODIFIER_OPTIONS,
  parseProductModifiers,
  serializeProductModifiers,
  type ModifierGroup,
  type ModifierOption,
} from "@/lib/products/modifiers";
import {
  costPerUnit,
  formatUnitCount,
} from "@/lib/inventory/stock";
import { isLowStock } from "@/lib/pricing/cart-line";

/** Mirrors `MAX_RECIPE_ROWS` in the demo write so the dialog cannot overrun it. */
const MAX_INGREDIENT_ROWS = 20;

/**
 * One line of a recipe while it is being edited. `itemId` stays empty until the
 * merchant picks a stock item, so a half-typed line is dropped rather than sent.
 */
type IngredientRow = {
  key: string;
  itemId: string;
  qty: string;
  /** Kept from the saved list so a seeded note survives a quantity edit. */
  note: string;
};

let ingredientKeySeed = 0;
function newIngredientKey(): string {
  ingredientKeySeed += 1;
  return `ing-${ingredientKeySeed}`;
}

function toIngredientRows(rows: ProductIngredient[]): IngredientRow[] {
  return rows.map((row) => ({
    key: row.id,
    itemId: row.item_id,
    qty: String(row.qty_per_sale),
    note: row.note ?? "",
  }));
}

function toIngredientInput(rows: IngredientRow[]): ProductIngredientInput[] {
  return rows
    .filter((row) => row.itemId)
    .map((row) => ({
      itemId: row.itemId,
      qtyPerSale: row.qty,
      note: row.note || null,
    }));
}

type FormState = {
  name: string;
  description: string;
  sku: string;
  category: string;
  price: string;
  cost_price: string;
  unit: string;
  default_discount_percent: string;
  image_url: string;
  is_active: boolean;
  stock_qty: string;
  low_stock_threshold: string;
  wholesale_price: string;
  groups: ModifierGroup[];
  ingredients: IngredientRow[];
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  sku: "",
  category: "",
  price: "",
  cost_price: "",
  unit: "",
  default_discount_percent: "",
  image_url: "",
  is_active: true,
  stock_qty: "",
  low_stock_threshold: "",
  wholesale_price: "",
  groups: [],
  ingredients: [],
});

function productToForm(
  p: Product,
  ingredients: ProductIngredient[],
): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    sku: p.sku ?? "",
    category: p.category ?? "",
    price: String(p.price),
    cost_price: p.cost_price != null ? String(p.cost_price) : "",
    unit: p.unit ?? "",
    default_discount_percent:
      p.default_discount_percent != null && p.default_discount_percent > 0
        ? String(p.default_discount_percent)
        : "",
    image_url: p.image_url ?? "",
    is_active: p.is_active,
    stock_qty: p.stock_qty != null ? String(p.stock_qty) : "",
    low_stock_threshold:
      p.low_stock_threshold != null ? String(p.low_stock_threshold) : "",
    wholesale_price:
      p.wholesale_price != null ? String(p.wholesale_price) : "",
    groups: parseProductModifiers(p),
    ingredients: toIngredientRows(ingredients),
  };
}

function formToInput(form: FormState): ProductUpsertInput {
  return {
    name: form.name,
    description: form.description || null,
    sku: form.sku || null,
    category: form.category || null,
    price: Number(form.price),
    cost_price: form.cost_price ? Number(form.cost_price) : null,
    unit: form.unit || null,
    is_active: form.is_active,
    default_discount_percent: form.default_discount_percent
      ? Number(form.default_discount_percent)
      : null,
    image_url: form.image_url.trim() || null,
    stock_qty: form.stock_qty ? Number(form.stock_qty) : null,
    low_stock_threshold: form.low_stock_threshold
      ? Number(form.low_stock_threshold)
      : null,
    wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : null,
    modifiers_json: serializeProductModifiers(form.groups),
  };
}

export function ProductsManager({
  mode,
  initialProducts,
  currencyCode,
  userRole,
  loadError,
  stockAdjustmentsByProductId = {},
  inventoryItems = [],
  ingredients = [],
}: {
  mode: "live" | "demo";
  initialProducts: Product[];
  currencyCode: string;
  userRole: string;
  loadError?: string | null;
  stockAdjustmentsByProductId?: Record<string, StockAdjustment[]>;
  /** The brand's stock list; empty means the brand has no inventory module. */
  inventoryItems?: InventoryItem[];
  /** Saved recipe lines for every product, flattened. */
  ingredients?: ProductIngredient[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [demoProducts, setDemoProducts] = useState(initialProducts);
  const products = mode === "demo" ? demoProducts : initialProducts;
  const setProducts = mode === "demo" ? setDemoProducts : () => {};
  // Recipes are a separate write from the product row, so the list is tracked
  // here: edits made in this dialog win, otherwise whatever the page rendered
  // (which `router.refresh()` updates after an Inventory-tab change).
  const [recipeEdits, setRecipeEdits] = useState<Record<string, ProductIngredient[]>>(
    {},
  );
  const baseRecipes = useMemo(() => {
    const map: Record<string, ProductIngredient[]> = {};
    for (const row of ingredients) {
      (map[row.product_id] ??= []).push(row);
    }
    return map;
  }, [ingredients]);
  function recipesOf(productId: string | null): ProductIngredient[] {
    if (!productId) return [];
    return recipeEdits[productId] ?? baseRecipes[productId] ?? [];
  }
  const itemsById = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems],
  );
  function itemName(id: string): string {
    return itemsById.get(id)?.name ?? "that item";
  }
  const canSeeIngredients = inventoryItems.length > 0;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const canEdit =
    mode === "demo" ? true : canManageProducts(userRole);
  const canAdd = mode === "demo" ? false : canManageProducts(userRole);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["all", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    let rows = [...products];
    if (activeFilter === "active") rows = rows.filter((p) => p.is_active);
    if (activeFilter === "inactive") rows = rows.filter((p) => !p.is_active);
    if (categoryFilter !== "all") {
      rows = rows.filter((p) => p.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, categoryFilter, activeFilter]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    dialogRef.current?.showModal();
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm(productToForm(product, recipesOf(product.id)));
    setFormError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    // Clear both banners: a stale row error must not sit next to a later
    // successful save (and vice versa for the toggle below).
    setFormError(null);
    setActionError(null);
    const input = formToInput(form);
    // A line with no quantity would be rejected by the recipe write, so catch
    // it here rather than save the product and half of its recipe.
    const ingredientRows = toIngredientInput(form.ingredients);
    const missingQty = ingredientRows.find((row) => !(Number(row.qtyPerSale) > 0));
    if (canSeeIngredients && missingQty) {
      setSaving(false);
      setFormError(
        `Enter how much of ${itemName(missingQty.itemId)} one sale uses, above 0.`,
      );
      return;
    }

    if (mode === "demo") {
      // Persist through the demo cookie bucket so Billing/catalog see the
      // change immediately and across reloads; local state keeps the list
      // in sync without a full refresh.
      try {
        const result = await saveProductAction(editingId, input);
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        const product = result.product;
        const recipeBefore = recipesOf(editingId).length;
        setProducts((prev) =>
          editingId
            ? prev.map((p) => (p.id === editingId ? product : p))
            : [...prev, product],
        );
        // The ingredient list is a second write: it only runs when the brand
        // keeps stock, and either saves everything or leaves the dialog open.
        // A blank row the merchant never filled in is not an edit — only an
        // editor emptied of every row counts as clearing the recipe.
        const clearRequested = !form.ingredients.length && recipeBefore > 0;
        if (canSeeIngredients && (ingredientRows.length || clearRequested)) {
          const saved = await saveProductIngredientsAction(
            product.id,
            ingredientRows,
          );
          if (!saved.ok) {
            setFormError(saved.error);
            return;
          }
          setRecipeEdits((prev) => ({ ...prev, [product.id]: saved.ingredients }));
        }
        closeDialog();
      } catch {
        // Network / 500 / server-action failure: surface it the same way as a
        // rejected result so the spinner never sticks.
        setFormError("Could not save. Try again.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const result = await saveProductAction(editingId, input);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    closeDialog();
    router.refresh();
  }

  async function handleToggleActive(product: Product) {
    if (!canEdit) return;
    const next = !product.is_active;
    setRowBusy(product.id);
    setActionError(null);
    setFormError(null);

    if (mode === "demo") {
      try {
        const result = await toggleProductActiveAction(product.id, next);
        if (result.ok) {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === product.id ? { ...p, is_active: next } : p,
            ),
          );
        } else {
          setActionError(result.error);
        }
      } catch {
        setActionError("Could not save. Try again.");
      } finally {
        setRowBusy(null);
      }
      return;
    }

    const result = await toggleProductActiveAction(product.id, next);
    setRowBusy(null);
    if (result.ok) router.refresh();
  }

  async function handleToggleUnavailable(product: Product) {
    if (!canEdit) return;
    const next = !product.unavailable;
    setRowBusy(product.id);
    setActionError(null);
    setFormError(null);

    if (mode === "demo") {
      try {
        const result = await toggleProductUnavailableAction(product.id, next);
        if (result.ok) {
          setProducts((prev) =>
            prev.map((p) => (p.id === product.id ? { ...p, unavailable: next } : p)),
          );
        } else {
          setActionError(result.error);
        }
      } catch {
        setActionError("Could not save. Try again.");
      } finally {
        setRowBusy(null);
      }
      return;
    }

    const result = await toggleProductUnavailableAction(product.id, next);
    setRowBusy(null);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">{loadError}</p>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">{actionError}</p>
      ) : null}

      {!canEdit && mode === "live" ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          Your role can view products but not edit them.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
            aria-label="Search products"
          />
          <select
            className="ob-input sm:max-w-[10rem]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Category filter"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
          <select
            className="ob-input sm:max-w-[10rem]"
            value={activeFilter}
            onChange={(e) =>
              setActiveFilter(e.target.value as typeof activeFilter)
            }
            aria-label="Status filter"
          >
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {canAdd ? (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            Add product
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No products match"
          description={
            canAdd
              ? "Add a product or adjust your filters."
              : "Try changing search or filters."
          }
        />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="ob-card p-4">
                <div className="flex gap-3">
                  <ProductThumbnail
                    name={p.name}
                    imageUrl={p.image_url}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {p.category ?? "Uncategorized"}
                    </p>
                    <div className="mt-1">
                      <ProductPrice
                        product={p}
                        currencyCode={currencyCode}
                        size="sm"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.stock_qty != null ? (
                        <Badge tone={isLowStock(p) ? "warning" : "neutral"}>
                          Stock {p.stock_qty}
                        </Badge>
                      ) : null}
                      <Badge tone={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge tone={p.unavailable ? "danger" : "success"}>
                        {p.unavailable ? "NA" : "A"}
                      </Badge>
                    </div>
                  </div>
                </div>
                {canEdit ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 py-2.5 text-xs"
                      onClick={() => openEdit(p)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 py-2.5 text-xs"
                      loading={rowBusy === p.id}
                      onClick={() => handleToggleActive(p)}
                    >
                      {p.is_active ? "Off" : "On"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="ob-touch-target flex-1 py-2.5 text-xs"
                      loading={rowBusy === p.id}
                      onClick={() => handleToggleUnavailable(p)}
                    >
                      {p.unavailable ? "Available" : "Unavailable"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="ob-scroll-x ob-card hidden md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? <th className="px-4 py-3 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <ProductThumbnail
                        name={p.name}
                        imageUrl={p.image_url}
                        size="md"
                      />
                      <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    {p.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ob-text-muted)]">
                        {p.description}
                      </p>
                    ) : null}
                    {p.sku ? (
                      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                        SKU {p.sku}
                      </p>
                    ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.category ?? "Uncategorized"}</td>
                  <td className="px-4 py-3">
                    <ProductPrice product={p} currencyCode={currencyCode} size="sm" />
                    {p.wholesale_price != null ? (
                      <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                        Wholesale {formatMoney(p.wholesale_price, currencyCode)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {p.stock_qty != null ? (
                      <Badge tone={isLowStock(p) ? "warning" : "neutral"}>
                        {p.stock_qty}
                      </Badge>
                    ) : (
                      <span className="text-xs text-[var(--ob-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge tone={p.unavailable ? "danger" : "success"}>
                        {p.unavailable ? "NA" : "A"}
                      </Badge>
                    </div>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-3 py-1.5 text-xs"
                          loading={rowBusy === p.id}
                          onClick={() => handleToggleActive(p)}
                        >
                          {p.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-3 py-1.5 text-xs"
                          loading={rowBusy === p.id}
                          onClick={() => handleToggleUnavailable(p)}
                        >
                          {p.unavailable ? "Mark available" : "Mark unavailable"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <dialog
        ref={dialogRef}
        className={cn(
          "w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-[var(--ob-radius-lg)]",
          "border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)]",
          "backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]",
          "max-sm:w-[calc(100vw-2rem)] max-sm:rounded-[var(--ob-radius-xl)]",
        )}
        onClose={() => setFormError(null)}
      >
        <form onSubmit={handleSave} className="p-6">
          <h2 className="text-lg font-semibold">Edit product</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Changes apply to Billing and new orders.
            {mode === "demo"
              ? " Demo edits persist in this browser (cookie-backed demo data)."
              : ""}
          </p>

          <div className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Name</span>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Description</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                className="mt-1 w-full ob-input resize-y"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Product image URL</span>
              <Input
                type="url"
                inputMode="url"
                value={form.image_url}
                onChange={(e) =>
                  setForm({ ...form, image_url: e.target.value })
                }
                placeholder="https://… (optional)"
                className="mt-1"
              />
              <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                HTTPS link to a photo — shown as a small tile in Billing (POS).
              </span>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ProductThumbnail
                  name={form.name || "Product"}
                  imageUrl={form.image_url || null}
                  size="md"
                />
                {form.image_url.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setForm({ ...form, image_url: "" })}
                  >
                    Remove image
                  </Button>
                ) : null}
              </div>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Price ({currencyCode})</span>
                <Input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Cost price</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) =>
                    setForm({ ...form, cost_price: e.target.value })
                  }
                  className="mt-1"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Category</span>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  placeholder="e.g. Coffee"
                  className="mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Unit</span>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="cup, plate…"
                  className="mt-1"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Default discount %</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.default_discount_percent}
                  onChange={(e) =>
                    setForm({ ...form, default_discount_percent: e.target.value })
                  }
                  placeholder="Optional — e.g. 50"
                  className="mt-1"
                />
                <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                  Applied automatically in Billing (list price stays the same).
                </span>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="font-medium">Stock qty</span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={form.stock_qty}
                  onChange={(e) =>
                    setForm({ ...form, stock_qty: e.target.value })
                  }
                  placeholder="Optional"
                  className="mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Low-stock at</span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={form.low_stock_threshold}
                  onChange={(e) =>
                    setForm({ ...form, low_stock_threshold: e.target.value })
                  }
                  placeholder="e.g. 5"
                  className="mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Wholesale price</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesale_price}
                  onChange={(e) =>
                    setForm({ ...form, wholesale_price: e.target.value })
                  }
                  placeholder="Tier pricing"
                  className="mt-1"
                />
              </label>
            </div>
            <ModifierGroupsEditor
              groups={form.groups}
              readOnly={!canAdd}
              onChange={(groups) => setForm((f) => ({ ...f, groups }))}
            />
            {canSeeIngredients ? (
              <IngredientListEditor
                rows={form.ingredients}
                items={inventoryItems}
                currencyCode={currencyCode}
                onChange={(rows) => setForm((f) => ({ ...f, ingredients: rows }))}
              />
            ) : null}
            <label className="block text-sm">
              <span className="font-medium">SKU</span>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Active (visible in Billing)
            </label>
            {editingId && canAdd ? (
              <StockAdjustmentPanel
                productId={editingId}
                recent={stockAdjustmentsByProductId[editingId] ?? []}
              />
            ) : null}
          </div>

          {formError ? (
            <p className="mt-3 text-sm text-[var(--ob-danger)]" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save product
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/**
 * Customizations are stored per product as groups of options (`modifiers_json`):
 * `single` renders as radios at checkout (Size, seasoning), `multi` as
 * checkboxes (add-ons). Each option carries a signed price delta, so a smaller
 * size can cost less and a preference swap can cost nothing.
 */
function ModifierGroupsEditor({
  groups,
  readOnly,
  onChange,
}: {
  groups: ModifierGroup[];
  readOnly: boolean;
  onChange: (groups: ModifierGroup[]) => void;
}) {
  function update(index: number, patch: Partial<ModifierGroup>) {
    onChange(
      groups.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );
  }

  function updateOption(
    groupIndex: number,
    optionIndex: number,
    patch: Partial<ModifierOption>,
  ) {
    onChange(
      groups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              options: group.options.map((option, j) =>
                j === optionIndex ? { ...option, ...patch } : option,
              ),
            }
          : group,
      ),
    );
  }

  /** Only one default per single group; multi groups can carry several. */
  function toggleDefault(groupIndex: number, optionIndex: number) {
    const group = groups[groupIndex];
    const wasOn = !!group.options[optionIndex]?.default;
    const single = group.type === "single";
    onChange(
      groups.map((current, i) =>
        i !== groupIndex
          ? current
          : {
              ...current,
              options: current.options.map((option, j) => {
                const on =
                  j === optionIndex
                    ? !wasOn
                    : single
                      ? false
                      : !!option.default;
                return on
                  ? { ...option, default: true }
                  : { id: option.id, name: option.name, price: option.price };
              }),
            },
      ),
    );
  }

  function addGroup() {
    const used = usedIds(groups);
    const group: ModifierGroup = {
      id: nextId("group", used),
      name: "",
      type: "single",
      required: true,
      options: [],
    };
    used.add(group.id);
    group.options = [{ id: nextId("option", used), name: "", price: 0 }];
    onChange([...groups, group]);
  }

  function addOption(groupIndex: number) {
    const used = usedIds(groups);
    const group = groups[groupIndex];
    onChange(
      groups.map((current, i) =>
        i === groupIndex
          ? {
              ...current,
              options: [
                ...current.options,
                { id: nextId("option", used, group.id), name: "", price: 0 },
              ],
            }
          : current,
      ),
    );
  }

  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    onChange(
      groups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              options: group.options.filter((_, j) => j !== optionIndex),
            }
          : group,
      ),
    );
  }

  return (
    <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Customizations</p>
        {!readOnly && groups.length < MAX_MODIFIER_GROUPS ? (
          <Button type="button" variant="ghost" className="text-xs" onClick={addGroup}>
            Add group
          </Button>
        ) : null}
      </div>
      {groups.length ? (
        <ul className="mt-2 space-y-3">
          {groups.map((group, groupIndex) => (
            <li
              key={group.id}
              className="space-y-2 rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Group name"
                  className="min-w-0 flex-1 basis-40"
                  placeholder="Size / Seasoning"
                  value={group.name}
                  onChange={(e) => update(groupIndex, { name: e.target.value })}
                />
                <div className="w-32 shrink-0">
                  <select
                    aria-label="How many can be picked"
                    className="ob-input"
                    value={group.type}
                    onChange={(e) =>
                      update(groupIndex, {
                        type: e.target.value === "multi" ? "multi" : "single",
                        required:
                          e.target.value === "multi" ? false : group.required,
                      })
                    }
                  >
                    <option value="single">Pick one</option>
                    <option value="multi">Choose any</option>
                  </select>
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    aria-label="Remove group"
                    className="shrink-0 rounded-full px-2 text-lg leading-none text-[var(--ob-text-muted)] hover:bg-[var(--ob-surface)]"
                    onClick={() => removeGroup(groupIndex)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--ob-text-muted)]">
                <input
                  type="checkbox"
                  checked={!!group.required}
                  disabled={group.type !== "single"}
                  onChange={(e) =>
                    update(groupIndex, { required: e.target.checked })
                  }
                />
                Required — falls back to the default
              </label>
              <ul className="space-y-2">
                {group.options.map((option, optionIndex) => (
                  <li key={option.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label="Option label"
                      className="min-w-0 flex-1 basis-32"
                      placeholder="Large"
                      value={option.name}
                      onChange={(e) =>
                        updateOption(groupIndex, optionIndex, {
                          name: e.target.value,
                        })
                      }
                    />
                    <div className="w-24 shrink-0">
                      <Input
                        aria-label="Price change"
                        type="number"
                        step="0.01"
                        placeholder="+40"
                        value={String(option.price)}
                        onChange={(e) =>
                          updateOption(groupIndex, optionIndex, {
                            price: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-[var(--ob-text-muted)]">
                      <input
                        type="checkbox"
                        checked={!!option.default}
                        onChange={() => toggleDefault(groupIndex, optionIndex)}
                      />
                      Default
                    </label>
                    {!readOnly ? (
                      <button
                        type="button"
                        aria-label="Remove option"
                        className="shrink-0 rounded-full px-2 text-lg leading-none text-[var(--ob-text-muted)] hover:bg-[var(--ob-surface)]"
                        onClick={() => removeOption(groupIndex, optionIndex)}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!readOnly && group.options.length < MAX_MODIFIER_OPTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => addOption(groupIndex)}
                >
                  Add option
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          Sizes, toppings or prep choices (extra shot, peri peri) — asked at
          checkout and priced as a change on the item.
        </p>
      )}
    </div>
  );
}

/**
 * The recipe side of inventory: what one sale of this product eats from the
 * shelf. Quantities are in the stock item's own units (slices, glasses, sq ft),
 * so "2 slices of bread" and "150 ml of milk" sit on the same list. Saving a
 * bill deducts exactly these amounts, which is how the Inventory tab's usage
 * report and the remaining packs stay honest.
 */
function IngredientListEditor({
  rows,
  items,
  currencyCode,
  onChange,
}: {
  rows: IngredientRow[];
  items: InventoryItem[];
  currencyCode: string;
  onChange: (rows: IngredientRow[]) => void;
}) {
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  /** 30+ stock items are easier to find grouped the way they are stored. */
  const grouped = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {};
    for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = item.category ?? "Uncategorized";
      (map[key] ??= []).push(item);
    }
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, map[key]] as const);
  }, [items]);

  const picked = rows
    .map((row) => ({ row, item: byId.get(row.itemId) }))
    .filter((entry): entry is { row: IngredientRow; item: InventoryItem } =>
      Boolean(entry.item),
    );
  const materialCost = picked.reduce(
    (sum, { row, item }) =>
      Number(row.qty) > 0 ? sum + Number(row.qty) * costPerUnit(item) : sum,
    0,
  );
  const duplicates = rows.filter(
    (row, index) =>
      row.itemId &&
      rows.findIndex((other) => other.itemId === row.itemId) !== index,
  ).length;

  function update(index: number, patch: Partial<IngredientRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Ingredients</p>
        {rows.length < MAX_INGREDIENT_ROWS ? (
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() =>
              onChange([...rows, { key: newIngredientKey(), itemId: "", qty: "", note: "" }])
            }
          >
            Add ingredient
          </Button>
        ) : null}
      </div>

      {picked.length ? (
        <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
          Material per sale ≈ {formatMoney(Math.round(materialCost * 100) / 100, currencyCode)}
          {" · deducted from Inventory every time this is billed"}
        </p>
      ) : null}

      {rows.length ? (
        <ul className="mt-2 space-y-2">
          {rows.map((row, index) => {
            const item = byId.get(row.itemId);
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-36">
                  <select
                    aria-label="Stock item"
                    className="ob-input"
                    value={row.itemId}
                    onChange={(e) => update(index, { itemId: e.target.value })}
                  >
                    <option value="">Choose a stock item…</option>
                    {grouped.map(([category, group]) => (
                      <optgroup key={category} label={category}>
                        {group.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="w-24 shrink-0">
                  <Input
                    aria-label="Amount per sale"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="2"
                    value={row.qty}
                    onChange={(e) => update(index, { qty: e.target.value })}
                  />
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-[var(--ob-text-muted)]">
                  {item ? `${item.unit} per sale` : "per sale"}
                </span>
                <button
                  type="button"
                  aria-label="Remove ingredient"
                  className="shrink-0 rounded-full px-2 text-lg leading-none text-[var(--ob-text-muted)] hover:bg-[var(--ob-surface)]"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  ×
                </button>
                {item ? (
                  <p className="basis-full -mt-1 text-xs text-[var(--ob-text-muted)]">
                    {formatUnitCount(item.units_per_pack, item.unit)} a pack ·{" "}
                    {formatMoney(item.cost_per_pack, currencyCode)}
                    {item.note ? ` · ${item.note}` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          What goes into one sale — 2 slices of bread, 1 tomato. Every billed
          order then deducts these from Inventory.
        </p>
      )}

      {duplicates ? (
        <p className="mt-2 text-xs text-[var(--ob-warning)]">
          An item listed twice keeps only the last line — merge the amounts
          instead.
        </p>
      ) : null}
    </div>
  );
}

function usedIds(groups: ModifierGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    ids.add(group.id);
    for (const option of group.options) ids.add(option.id);
  }
  return ids;
}

/** Option ids live in one flat per-product space, so they must not collide. */
function nextId(kind: string, used: Set<string>, prefix?: string): string {
  const base = `${prefix ? `${prefix}-` : ""}${kind}`.slice(0, 30);
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}
