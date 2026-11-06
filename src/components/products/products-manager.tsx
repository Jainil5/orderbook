"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, ProductUpsertInput, StockAdjustment } from "@/types/database";
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
} from "@/services/product-actions";
import { Pencil, Plus } from "lucide-react";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { StockAdjustmentPanel } from "@/components/products/stock-adjustment-panel";
import {
  parseProductModifiers,
  serializeProductModifiers,
  type ProductModifier,
} from "@/lib/products/modifiers";
import { isLowStock } from "@/lib/pricing/cart-line";

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
  modifiers: ProductModifier[];
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
  modifiers: [],
});

function productToForm(p: Product): FormState {
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
    modifiers: parseProductModifiers(p),
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
    modifiers_json: serializeProductModifiers(form.modifiers),
  };
}

export function ProductsManager({
  mode,
  initialProducts,
  currencyCode,
  userRole,
  loadError,
  stockAdjustmentsByProductId = {},
}: {
  mode: "live" | "demo";
  initialProducts: Product[];
  currencyCode: string;
  userRole: string;
  loadError?: string | null;
  stockAdjustmentsByProductId?: Record<string, StockAdjustment[]>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [demoProducts, setDemoProducts] = useState(initialProducts);
  const products = mode === "demo" ? demoProducts : initialProducts;
  const setProducts = mode === "demo" ? setDemoProducts : () => {};
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const canEdit =
    mode === "demo" ? true : canManageProducts(userRole);

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
    setForm(productToForm(product));
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
    setFormError(null);
    const input = formToInput(form);

    if (mode === "demo") {
      if (editingId) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingId
              ? ({
                  ...p,
                  ...input,
                  price: Number(input.price),
                  cost_price:
                    input.cost_price != null ? Number(input.cost_price) : null,
                  default_discount_percent:
                    input.default_discount_percent != null
                      ? Number(input.default_discount_percent)
                      : null,
                  image_url: input.image_url ?? null,
                  stock_qty:
                    input.stock_qty != null ? Number(input.stock_qty) : null,
                  low_stock_threshold:
                    input.low_stock_threshold != null
                      ? Number(input.low_stock_threshold)
                      : null,
                  wholesale_price:
                    input.wholesale_price != null
                      ? Number(input.wholesale_price)
                      : null,
                  modifiers_json: input.modifiers_json ?? null,
                } as Product)
              : p,
          ),
        );
      } else {
        setProducts((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            brand_id: "demo",
            name: input.name,
            description: input.description ?? null,
            sku: input.sku ?? null,
            category: input.category ?? null,
            price: Number(input.price),
            cost_price:
              input.cost_price != null ? Number(input.cost_price) : null,
            unit: input.unit ?? null,
            is_active: input.is_active !== false,
            default_discount_percent:
              input.default_discount_percent != null
                ? Number(input.default_discount_percent)
                : null,
            image_url: input.image_url ?? null,
            stock_qty:
              input.stock_qty != null ? Number(input.stock_qty) : null,
            low_stock_threshold:
              input.low_stock_threshold != null
                ? Number(input.low_stock_threshold)
                : null,
            wholesale_price:
              input.wholesale_price != null
                ? Number(input.wholesale_price)
                : null,
            modifiers_json: input.modifiers_json ?? null,
          },
        ]);
      }
      setSaving(false);
      closeDialog();
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

    if (mode === "demo") {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_active: next } : p,
        ),
      );
      setRowBusy(null);
      return;
    }

    const result = await toggleProductActiveAction(product.id, next);
    setRowBusy(null);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <p className="text-sm text-[var(--ob-danger)]">{loadError}</p>
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
        {canEdit ? (
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
            canEdit
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
                    <Badge tone={p.is_active ? "success" : "neutral"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
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
          "border border-[var(--ob-border)] bg-[var(--ob-surface)] p-0 shadow-[var(--ob-shadow-md)]",
          "backdrop:bg-black/40",
          "max-sm:fixed max-sm:inset-0 max-sm:m-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:rounded-none",
        )}
        onClose={() => setFormError(null)}
      >
        <form onSubmit={handleSave} className="p-6">
          <h2 className="text-lg font-semibold">
            {editingId ? "Edit product" : "Add product"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Changes apply to Billing and new orders.
            {mode === "demo" ? " Demo edits stay in this session only." : ""}
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
            <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Add-ons / modifiers</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      modifiers: [
                        ...f.modifiers,
                        {
                          id: `mod-${Date.now()}`,
                          name: "",
                          price: 0,
                        },
                      ],
                    }))
                  }
                >
                  Add modifier
                </Button>
              </div>
              {form.modifiers.length ? (
                <ul className="mt-2 space-y-2">
                  {form.modifiers.map((mod, index) => (
                    <li key={mod.id} className="grid gap-2 sm:grid-cols-3">
                      <Input
                        placeholder="ID"
                        value={mod.id}
                        onChange={(e) =>
                          setForm((f) => {
                            const modifiers = [...f.modifiers];
                            modifiers[index] = {
                              ...modifiers[index],
                              id: e.target.value,
                            };
                            return { ...f, modifiers };
                          })
                        }
                      />
                      <Input
                        placeholder="Label"
                        value={mod.name}
                        onChange={(e) =>
                          setForm((f) => {
                            const modifiers = [...f.modifiers];
                            modifiers[index] = {
                              ...modifiers[index],
                              name: e.target.value,
                            };
                            return { ...f, modifiers };
                          })
                        }
                      />
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Price"
                          value={String(mod.price)}
                          onChange={(e) =>
                            setForm((f) => {
                              const modifiers = [...f.modifiers];
                              modifiers[index] = {
                                ...modifiers[index],
                                price: Number(e.target.value) || 0,
                              };
                              return { ...f, modifiers };
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-2 text-xs"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              modifiers: f.modifiers.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                  Optional extras (extra shot, fabric swatch) shown at checkout.
                </p>
              )}
            </div>
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
            {editingId && canEdit ? (
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
