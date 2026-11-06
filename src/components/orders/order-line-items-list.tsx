import type { BillLineItem } from "@/lib/documents/types";
import { formatMoney } from "@/lib/format";
import { ProductThumbnail } from "@/components/products/product-thumbnail";

export function OrderLineItemsList({
  lines,
  currencyCode,
  showImages,
}: {
  lines: BillLineItem[];
  currencyCode: string;
  showImages: boolean;
}) {
  return (
    <ul className="mt-3 space-y-3 text-sm">
      {lines.map((line, index) => (
        <li
          key={`${line.name}-${index}`}
          className="flex gap-3 border-b border-[var(--ob-border)] pb-3 last:border-0 last:pb-0"
        >
          {showImages && line.imageUrl ? (
            <ProductThumbnail
              name={line.name}
              imageUrl={line.imageUrl}
              size="sm"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{line.name}</p>
            <p className="text-xs text-[var(--ob-text-muted)]">
              Qty {line.quantity}
              {line.unit ? ` · ${line.unit}` : ""}
            </p>
          </div>
          <span className="shrink-0 font-medium">
            {formatMoney(line.lineTotal, currencyCode)}
          </span>
        </li>
      ))}
    </ul>
  );
}
