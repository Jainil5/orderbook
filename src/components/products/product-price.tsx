import type { Product } from "@/types/database";
import { formatMoney } from "@/lib/format";
import {
  effectiveUnitPrice,
  formatDiscountPercentLabel,
  hasProductDefaultDiscount,
  productDefaultDiscountPercent,
} from "@/lib/pricing/discounts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export function ProductPrice({
  product,
  currencyCode,
  size = "md",
  className,
}: {
  product: Product;
  currencyCode: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const onSale = hasProductDefaultDiscount(product);
  const saleUnit = effectiveUnitPrice(product);
  const pct = productDefaultDiscountPercent(product);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onSale ? (
        <>
          <span
            className={cn(
              "font-semibold text-[var(--ob-primary)]",
              size === "sm" ? "text-sm" : "text-sm",
            )}
          >
            {formatMoney(saleUnit, currencyCode)}
          </span>
          <span
            className={cn(
              "text-[var(--ob-text-muted)] line-through",
              size === "sm" ? "text-xs" : "text-sm",
            )}
          >
            {formatMoney(product.price, currencyCode)}
          </span>
          <Badge tone="warning" className="shrink-0">
            {formatDiscountPercentLabel(pct)}
          </Badge>
        </>
      ) : (
        <span
          className={cn(
            "font-semibold text-[var(--ob-primary)]",
            size === "sm" ? "text-sm" : "text-sm",
          )}
        >
          {formatMoney(product.price, currencyCode)}
        </span>
      )}
    </div>
  );
}
