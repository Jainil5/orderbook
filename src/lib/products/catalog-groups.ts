import type { Product } from "@/types/database";

export const UNGROUPED = "Uncategorized";

/**
 * Chips, filters and group headers all derive the label from here, so a
 * blank-spaced category can't produce a chip that matches no group.
 */
export function categoryLabel(product: Product): string {
  return product.category?.trim() || UNGROUPED;
}

export function groupCategories(products: Product[]): string[] {
  const set = new Set<string>();
  products.forEach((p) => set.add(categoryLabel(p)));
  return ["All", ...Array.from(set).sort()];
}

export type ProductGroup = {
  category: string;
  products: Product[];
};

/** Catalog rows bucketed by category, groups alphabetical. */
export function groupProductsByCategory(products: Product[]): ProductGroup[] {
  const map = new Map<string, Product[]>();
  products.forEach((p) => {
    const key = categoryLabel(p);
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, rows]) => ({ category, products: rows }));
}

export type CategoryTint = { background: string; accent: string };

const CATEGORY_TINTS: CategoryTint[] = [
  { background: "#fdf1e3", accent: "#b45309" },
  { background: "#e8f4ec", accent: "#15803d" },
  { background: "#e9f1fb", accent: "#1d4ed8" },
  { background: "#f6ecf9", accent: "#9333ea" },
  { background: "#fbeaec", accent: "#be123c" },
  { background: "#e6f5f6", accent: "#0e7490" },
  { background: "#f5f0e2", accent: "#854d0e" },
  { background: "#edf0f7", accent: "#4338ca" },
];

/** Stable pastel per category so sections and chips share one color mapping. */
export function categoryTint(category: string): CategoryTint {
  const normalized = category.trim().toLowerCase() || UNGROUPED.toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_TINTS[hash % CATEGORY_TINTS.length];
}
