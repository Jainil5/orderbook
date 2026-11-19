import type {
  Offer,
  OrderItem,
  Product,
} from "@/types/database";
import type { CustomerReview as Review } from "@/types/crm";
import {
  defaultModifierSelection,
  parseProductModifiers,
  type ModifierGroup,
} from "@/lib/products/modifiers";
import {
  SITE_PROFILES,
  type SiteCourse,
  type SiteProfile,
  type SiteStep,
} from "./registry";

/**
 * The public brand site reads the same CSV packs the workspace does. These
 * pure helpers turn pack rows into the shapes the site renders — menu
 * sections, the rail of repeated lines, the set, social-proof stats,
 * testimonials and the active offers a checkout may apply — so the site can
 * never drift from the counter's data.
 */

export type SiteMenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string | null;
  /** List price (with the product's default discount already applied). */
  price: number;
  listPrice: number;
  /** Percent off, when the product row carries a default discount. */
  discountPercent: number | null;
  imageUrl: string | null;
  /** Zero shelf stock blocks the add button, exactly like Billing does. */
  soldOut: boolean;
  /** Ordered at least twice across the pack's history — the "Popular" tag. */
  popular: boolean;
  /** Units sold across the pack's own order history. */
  orderedQty: number;
  /** Stock figure, when the row carries one. */
  stockQty: number | null;
  /** "120 portions on the shelf · pulled when you order" */
  detail: string;
  modifiers: ModifierGroup[];
  defaultModifierIds: string[];
};

export type SiteMenuSection = {
  category: string;
  blurb: string;
  items: SiteMenuItem[];
};

/** Fills `{qty}` / `{n}` style placeholders from real figures. */
export function fillLine(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : match,
  );
}

/**
 * The card's detail line — Ember Larder's "640 kcal · feeds two", except both
 * halves come from the row: the stock figure and the category note.
 */
export function detailLine(
  stockQty: number | null,
  category: string,
  profile: SiteProfile,
): string {
  const stock =
    stockQty == null
      ? profile.noStockLine
      : fillLine(profile.stockLine, { qty: stockQty });
  const note = profile.categoryNotes[category];
  return note ? `${stock} · ${note}` : stock;
}

function orderedCategories(
  items: SiteMenuItem[],
  profile: SiteProfile,
): string[] {
  const seen: string[] = [];
  for (const item of items) {
    const category = item.category;
    if (!seen.includes(category)) seen.push(category);
  }
  const head = profile.categoryOrder.filter((category) =>
    seen.includes(category),
  );
  const tail = seen.filter((category) => !head.includes(category));
  return [...head, ...tail];
}

export function buildMenuSections(
  products: Product[],
  orderItems: OrderItem[],
  profile: SiteProfile = SITE_PROFILES["BR-1"],
): SiteMenuSection[] {
  const counts = new Map<string, number>();
  for (const item of orderItems) {
    if (!item.product_id) continue;
    counts.set(item.product_id, (counts.get(item.product_id) ?? 0) + item.quantity);
  }

  const menu = products
    .filter((product) => product.is_active && !product.unavailable)
    .map<SiteMenuItem>((product) => {
      const discountPercent = Math.round(product.default_discount_percent ?? 0);
      const price = discountPercent
        ? Math.round(((product.price * (100 - discountPercent)) / 100) * 100) / 100
        : product.price;
      const category = product.category?.trim() || "More";
      const orderedQty = counts.get(product.id) ?? 0;
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category,
        unit: product.unit,
        price,
        listPrice: product.price,
        discountPercent: discountPercent || null,
        imageUrl: product.image_url ?? null,
        soldOut: product.stock_qty != null && product.stock_qty <= 0,
        popular: orderedQty >= 2,
        orderedQty,
        stockQty: product.stock_qty ?? null,
        detail: detailLine(product.stock_qty ?? null, category, profile),
        modifiers: parseProductModifiers(product),
        defaultModifierIds: defaultModifierSelection(
          parseProductModifiers(product),
        ),
      };
    });

  return orderedCategories(menu, profile).map((category) => ({
    category,
    blurb: profile.categoryBlurbs[category] ?? "",
    items: menu.filter((item) => item.category === category),
  }));
}

/** Heading numbers for the shelf: "15 lines, 5 sections, from ₹150". */
export type SiteShelfCounts = {
  lines: number;
  sections: number;
  cheapest: number | null;
  orderedTotal: number;
};

export function buildShelfCounts(
  sections: SiteMenuSection[],
): SiteShelfCounts {
  const items = sections.flatMap((section) => section.items);
  return {
    lines: items.length,
    sections: sections.length,
    cheapest: items.length
      ? Math.min(...items.map((item) => item.price))
      : null,
    orderedTotal: items.reduce((total, item) => total + item.orderedQty, 0),
  };
}

/**
 * The rail above the grid — Cubig's "Best Seller In …" strip, sorted by the
 * pack's own order history instead of hand-picked.
 */
export function buildRails(
  sections: SiteMenuSection[],
  limit = 6,
): SiteMenuItem[] {
  const items = sections.flatMap((section) => section.items);
  const ranked = [...items].sort(
    (a, b) => b.orderedQty - a.orderedQty || b.price - a.price,
  );
  const repeated = ranked.filter((item) => item.orderedQty > 0);
  return (repeated.length ? repeated : ranked).slice(0, limit);
}

export type SiteSetCourse = SiteCourse & { item: SiteMenuItem };

export type SiteSet = {
  courses: SiteSetCourse[];
  steps: SiteStep[];
  /** Counter price of the resolved courses, nothing added. */
  total: number;
  /** Courses the pack no longer sells, so the page can say so. */
  dropped: SiteCourse[];
};

/**
 * The set block, resolved against the live card: a course whose product row
 * has been retired is dropped rather than priced from memory.
 */
export function resolveSet(
  sections: SiteMenuSection[],
  profile: SiteProfile,
): SiteSet {
  const items = new Map(
    sections.flatMap((section) => section.items).map((item) => [item.id, item]),
  );
  const courses: SiteSetCourse[] = [];
  const dropped: SiteCourse[] = [];
  for (const course of profile.set.courses) {
    const item = items.get(course.productId);
    if (!item) {
      dropped.push(course);
      continue;
    }
    courses.push({ ...course, item });
  }
  return {
    courses,
    dropped,
    steps: profile.set.steps ?? [],
    total: courses.reduce((total, course) => total + course.item.price, 0),
  };
}

export type SiteStats = {
  ordersServed: number;
  guests: number;
  avgRating: number | null;
  reviewCount: number;
  itemCount: number;
};

export function buildSiteStats(
  products: Product[],
  orders: { customer_id: string | null }[],
  reviews: Review[],
): SiteStats {
  const rated = reviews.filter((review) => review.rating > 0);
  const avgRating = rated.length
    ? Math.round(
        (rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) *
          10,
      ) / 10
    : null;
  return {
    ordersServed: orders.length,
    guests: new Set(
      orders.map((order) => order.customer_id).filter((id): id is string => !!id),
    ).size,
    avgRating,
    reviewCount: reviews.length,
    itemCount: products.filter((p) => p.is_active && !p.unavailable).length,
  };
}

export type SiteTestimonial = {
  rating: number;
  text: string;
  source: string;
  when: string;
};

export function buildTestimonials(reviews: Review[]): SiteTestimonial[] {
  return reviews
    .filter(
      (review) =>
        review.rating >= 4 &&
        review.text.trim().length >= 40 &&
        !review.complaint_id,
    )
    .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))
    .slice(0, 6)
    .map((review) => ({
      rating: review.rating,
      text: review.text.trim(),
      source: review.source,
      when: review.reviewed_at.slice(0, 10),
    }));
}

/** `{n}` captions, filled from the row's own count. */
export function siteCaption(template: string, n: number): string {
  return fillLine(template, { n });
}

/** Active offers a site checkout may apply, newest first, capped at three. */
export function siteOffers(offers: Offer[]): Offer[] {
  return offers
    .filter((offer) => offer.is_active && offer.code)
    .slice(0, 3);
}
