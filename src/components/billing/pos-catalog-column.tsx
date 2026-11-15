"use client";

import type { ReactNode } from "react";
import type { Product } from "@/types/database";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { groupProductsByCategory } from "@/lib/products/catalog-groups";

/* One viewport-tall column per side. 7.125rem is the sticky workspace header
   (74px) + main's top padding (24px) + the builder row's own bottom gutter
   (16px), so the row ends exactly at the fold: the page never scrolls, each
   column scrolls its own overflow instead. Both columns need this, so it lives
   here rather than inside one of them. */
export const posColumnHeight = "lg:h-[calc(100dvh-7.125rem)]";

export function PosCatalogColumn({
  searchPlaceholder,
  search,
  onSearch,
  categories,
  category,
  onCategory,
  products,
  renderTile,
}: {
  searchPlaceholder: string;
  search: string;
  onSearch: (value: string) => void;
  categories: string[];
  category: string;
  onCategory: (value: string) => void;
  products: Product[];
  renderTile: (product: Product) => ReactNode;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-1 flex-col lg:w-[68%] xl:w-[72%]", posColumnHeight)}
    >
      <div className="shrink-0 space-y-3 pb-3">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Product categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategory(cat)}
              aria-pressed={category === cat}
              className={cn(
                "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
                category === cat
                  ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                  : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* auto-fill packs the full width with no empty cells; the 1fr floor
            lets rows stretch to the panel when the catalog is short, so the
            section is used rather than leaving blank space below. The 45% arm
            keeps two columns alive on a phone, where 170px would not fit twice. */}
        <div
          className="ob-stagger grid min-h-full gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(min(170px, 45%), 1fr))",
            gridAutoRows: "minmax(210px, 1fr)",
          }}
        >
          {groupProductsByCategory(products)
            .flatMap((group) => group.products)
            .map((product) => renderTile(product))}
        </div>
      </div>
    </section>
  );
}
