import { formatMoney } from "@/lib/format";
import { effectiveUnitPrice } from "@/lib/pricing/discounts";
import type { InventoryItem, Product, ProductIngredient } from "@/types/database";

/**
 * The board the site shows is Orderbook's own catalog: every card here is a
 * `Product` row from the brand pack, priced by the same helpers Billing uses.
 * Nothing on this page is typed a second time — mark an item unavailable in
 * the workspace and the website stops selling it.
 */

/** Photo for a product row that has none of its own. */
const FALLBACK_PHOTO = "/showcase/brewery-cafe/coffee.jpg";

export interface MenuItem {
  /** Orderbook product id — an order line is keyed by this. */
  id: string;
  name: string;
  /** The product's own description line. */
  note: string;
  /** What the counter charges for one, the way the bill will compute it. */
  price: string;
  /** List price shown beside `price` when the row carries a default discount. */
  wasPrice: string | null;
  /** Ribbon worth trusting because it comes from the row, not from a copywriter. */
  badge: string | null;
  /** "cup" / "plate" / "bowl" — the unit the counter serves it in. */
  unit: string | null;
  src: string;
  /** Component names pulled from the product's recipe in the workspace. */
  inIt: string[];
  available: boolean;
  /** Shelf count, when the product is stock-tracked. */
  unitsLeft: number | null;
  /**
   * The catalog row itself. The tray prices and validates against this with
   * the same helpers Billing uses, so a total on the website can never drift
   * from the total of the order it creates.
   */
  product: Product;
}

export interface MenuGroup {
  id: string;
  title: string;
  kicker: string;
  prompt: string;
  blurb: string;
  items: MenuItem[];
}

/** Section furniture for the categories the demo brand actually sells. */
const GROUP_COPY: Record<string, { kicker: string; prompt: string; blurb: string }> = {
  Coffee: {
    kicker: "Single origin, roasted nearby",
    prompt: "Select your coffee",
    blurb:
      "One espresso base through the day, pulled short and sweet. Milk from the fridge across the road; oat and almond always on hand.",
  },
  Food: {
    kicker: "Plated from open till close",
    prompt: "Select your plate",
    blurb:
      "Toasted, grilled and bowl-built in the room you eat in. Sized to share badly and eat alone happily.",
  },
  Beverages: {
    kicker: "Shaken and pressed to order",
    prompt: "Select your drink",
    blurb:
      "No coffee, no milk foam — just the cold things we keep in the fridge by the till and the sodas we shake to order.",
  },
  "Sides & Dips": {
    kicker: "For the middle of the table",
    prompt: "Select a side",
    blurb: "Fried, toasted and salted at the pass, so the plate in front of you never goes quiet.",
  },
  Desserts: {
    kicker: "What the counter case is holding",
    prompt: "Select something sweet",
    blurb: "Baked in small batches each morning. When the case is empty, it is empty.",
  },
};

const GENERIC_COPY = {
  kicker: "From the same kitchen",
  prompt: "Select one",
  blurb: "Everything else the counter is serving today.",
};

/** Categories are free text on the product row, so an id has to survive any label. */
export const groupIdFor = (category: string | null): string =>
  (category ?? "uncategorized").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized";

function badgeFor(product: Product, unitsLeft: number | null): string | null {
  const pct = product.default_discount_percent;
  if (pct != null && pct > 0) return `${Math.round(pct)}% off today`;
  const low = product.low_stock_threshold;
  if (unitsLeft != null && low != null && unitsLeft <= low) return `Only ${unitsLeft} left`;
  return null;
}

export function menuItemFromProduct(
  product: Product,
  opts: { ingredients: string[]; currencyCode: string },
): MenuItem {
  // Billing takes the product's default discount off the line, so the card
  // prints what the customer is actually charged and strikes the list price.
  const charged = effectiveUnitPrice(product);
  const pct = product.default_discount_percent;
  return {
    id: product.id,
    name: product.name,
    note: product.description?.trim() || product.category?.trim() || "Asked for at the counter",
    price: formatMoney(charged, opts.currencyCode),
    wasPrice: pct != null && pct > 0 ? formatMoney(product.price, opts.currencyCode) : null,
    badge: badgeFor(product, product.stock_qty ?? null),
    unit: product.unit,
    src: product.image_url ?? FALLBACK_PHOTO,
    inIt: opts.ingredients,
    available: product.is_active && !product.unavailable,
    unitsLeft: product.stock_qty ?? null,
    product,
  };
}

/**
 * Products in pack order, bucketed by their category label. A category the
 * site has no copy for still gets a section — the menu is the data's, not ours.
 */
export function buildMenu(params: {
  products: Product[];
  ingredients: ProductIngredient[];
  inventory: InventoryItem[];
  currencyCode: string;
}): MenuGroup[] {
  const itemNameById = new Map(params.inventory.map((item) => [item.id, item.name] as const));
  const recipeByProductId = new Map<string, string[]>();
  for (const line of params.ingredients) {
    const name = itemNameById.get(line.item_id);
    if (!name) continue;
    const existing = recipeByProductId.get(line.product_id) ?? [];
    if (!existing.includes(name)) existing.push(name);
    recipeByProductId.set(line.product_id, existing);
  }

  const groups = new Map<string, MenuGroup>();
  for (const product of params.products) {
    const id = groupIdFor(product.category);
    let group = groups.get(id);
    if (!group) {
      const copy = GROUP_COPY[product.category ?? ""] ?? GENERIC_COPY;
      group = {
        id,
        title: product.category ?? "The Menu",
        ...copy,
        items: [],
      };
      groups.set(id, group);
    }
    group.items.push(
      menuItemFromProduct(product, {
        ingredients: recipeByProductId.get(product.id) ?? [],
        currencyCode: params.currencyCode,
      }),
    );
  }
  return [...groups.values()];
}

/** Worth a star on the board: the row itself is on offer or nearly gone. */
export const isRecommended = (item: MenuItem): boolean => Boolean(item.badge);
