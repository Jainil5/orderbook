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
