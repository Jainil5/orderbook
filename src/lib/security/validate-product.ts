import type { ProductUpsertInput } from "@/types/database";

const MAX_NAME = 120;
const MAX_DESC = 500;
const MAX_SKU = 64;
const MAX_CATEGORY = 80;
const MAX_UNIT = 32;
const MAX_PRICE = 10_000_000;

export function validateProductInput(
  input: ProductUpsertInput,
): { ok: true; data: ProductUpsertInput } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (!name || name.length > MAX_NAME) {
    return { ok: false, message: "Product name is required (max 120 characters)." };
  }

  const description = input.description?.trim() || null;
  if (description && description.length > MAX_DESC) {
    return { ok: false, message: "Description is too long." };
  }

  const sku = input.sku?.trim() || null;
  if (sku && sku.length > MAX_SKU) {
    return { ok: false, message: "SKU is too long." };
  }

  const category = input.category?.trim() || null;
  if (category && category.length > MAX_CATEGORY) {
    return { ok: false, message: "Category is too long." };
  }

  const unit = input.unit?.trim() || null;
  if (unit && unit.length > MAX_UNIT) {
    return { ok: false, message: "Unit is too long." };
  }

  if (!Number.isFinite(input.price) || input.price < 0 || input.price > MAX_PRICE) {
    return { ok: false, message: "Enter a valid price." };
  }

  let cost_price: number | null = null;
  if (input.cost_price != null && input.cost_price !== "") {
    const cost =
      typeof input.cost_price === "string"
        ? Number(input.cost_price)
        : input.cost_price;
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_PRICE) {
      return { ok: false, message: "Enter a valid cost price." };
    }
    cost_price = cost;
  }

  let default_discount_percent: number | null = null;
  if (
    input.default_discount_percent != null &&
    input.default_discount_percent !== ""
  ) {
    const pct =
      typeof input.default_discount_percent === "string"
        ? Number(input.default_discount_percent)
        : input.default_discount_percent;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        ok: false,
        message: "Default discount must be between 0 and 100.",
      };
    }
    if (pct > 0) default_discount_percent = pct;
  }

  let image_url: string | null = null;
  if (input.image_url != null && String(input.image_url).trim() !== "") {
    const raw = String(input.image_url).trim().slice(0, 2048);
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") {
        return {
          ok: false,
          message: "Image link must be a secure https:// URL.",
        };
      }
      image_url = raw;
    } catch {
      return { ok: false, message: "Enter a valid image URL." };
    }
  }

  let stock_qty: number | null = null;
  if (input.stock_qty != null && input.stock_qty !== "") {
    const qty =
      typeof input.stock_qty === "string"
        ? Number(input.stock_qty)
        : input.stock_qty;
    if (!Number.isFinite(qty) || qty < 0) {
      return { ok: false, message: "Enter a valid stock quantity." };
    }
    stock_qty = qty;
  }

  let low_stock_threshold: number | null = null;
  if (input.low_stock_threshold != null && input.low_stock_threshold !== "") {
    const th =
      typeof input.low_stock_threshold === "string"
        ? Number(input.low_stock_threshold)
        : input.low_stock_threshold;
    if (!Number.isFinite(th) || th < 0) {
      return { ok: false, message: "Enter a valid low-stock threshold." };
    }
    low_stock_threshold = th;
  }

  let wholesale_price: number | null = null;
  if (input.wholesale_price != null && input.wholesale_price !== "") {
    const wp =
      typeof input.wholesale_price === "string"
        ? Number(input.wholesale_price)
        : input.wholesale_price;
    if (!Number.isFinite(wp) || wp < 0 || wp > MAX_PRICE) {
      return { ok: false, message: "Enter a valid wholesale price." };
    }
    wholesale_price = wp;
  }

  const modifiers_json = input.modifiers_json ?? null;
  if (modifiers_json && !Array.isArray(modifiers_json)) {
    return { ok: false, message: "Invalid modifiers." };
  }

  return {
    ok: true,
    data: {
      name,
      description,
      sku,
      category,
      unit,
      price: Number(input.price),
      cost_price,
      default_discount_percent,
      image_url,
      is_active: input.is_active !== false,
      stock_qty,
      low_stock_threshold,
      wholesale_price,
      modifiers_json,
    },
  };
}

export function canManageProducts(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
