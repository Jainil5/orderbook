"use client";

import type { PointerEvent } from "react";
import type { Product } from "@/types/database";
import { ProductPrice } from "@/components/products/product-price";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Info, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TILT_DEG = 7;

/**
 * Writing custom properties keeps the transform in CSS, which means
 * `prefers-reduced-motion` can switch it off without the handler knowing.
 * Touch devices are skipped: a finger resting mid-card would tilt the tile
 * while the cashier only meant to tap it.
 */
function onPointerMove(event: PointerEvent<HTMLDivElement>) {
  const el = event.currentTarget;
  if (event.pointerType !== "mouse") return;
  const rect = el.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  el.dataset.tilting = "true";
  el.style.setProperty("--ob-tilt-ry", `${(x * TILT_DEG * 2).toFixed(2)}deg`);
  el.style.setProperty("--ob-tilt-rx", `${(-y * TILT_DEG * 2).toFixed(2)}deg`);
  el.style.setProperty("--ob-tilt-lift", "-3px");
  el.style.setProperty("--ob-tilt-scale", "1.025");
}

function onPointerRest(event: PointerEvent<HTMLDivElement>) {
  const el = event.currentTarget;
  delete el.dataset.tilting;
  el.style.removeProperty("--ob-tilt-ry");
  el.style.removeProperty("--ob-tilt-rx");
  el.style.removeProperty("--ob-tilt-lift");
  el.style.removeProperty("--ob-tilt-scale");
}

/** Desktop/tablet POS catalog tile. */
export function PosProductTileWithButton({
  product,
  currencyCode,
  inCartQty,
  flashing,
  addLabel,
  addAnotherLabel,
  stockLabel,
  lowStock,
  onAdd,
  onPeek,
}: {
  product: Product;
  currencyCode: string;
  inCartQty: number;
  flashing: boolean;
  addLabel: string;
  addAnotherLabel: string;
  stockLabel?: string | null;
  lowStock?: boolean;
  onAdd: () => void;
  onPeek: () => void;
}) {
  return (
    <div
      className={cn(
        "ob-card ob-tile ob-tilt flex h-full flex-col overflow-hidden p-0",
        flashing && "ob-pop ring-2 ring-[var(--ob-accent)] ring-offset-2",
        inCartQty > 0 && "border-[var(--ob-primary)]",
        product.unavailable && "opacity-50",
      )}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerRest}
      onPointerCancel={onPointerRest}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onPeek}
          aria-label={`View details of ${product.name}`}
          className="block w-full border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ob-accent)]"
        >
          <ProductThumbnail
            name={product.name}
            imageUrl={product.image_url}
            category={product.category}
            size="wide"
          />
          {inCartQty > 0 ? (
            <span className="absolute right-2 top-2 rounded-full bg-[var(--ob-primary)] px-2 py-0.5 text-xs font-semibold text-[var(--ob-primary-foreground)] shadow-sm">
              ×{inCartQty}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onPeek}
          aria-label={`Show full details of ${product.name}`}
          className="absolute left-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)]/90 text-[var(--ob-text-muted)] transition hover:bg-[var(--ob-surface)]"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-1 text-sm font-semibold leading-tight">
          {product.name}
        </p>
        {product.description?.trim() ? (
          <p className="line-clamp-1 text-xs leading-snug text-[var(--ob-text-muted)]">
            {product.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductPrice product={product} currencyCode={currencyCode} size="sm" />
          {stockLabel ? (
            <Badge tone={lowStock ? "warning" : "neutral"} className="text-[10px]">
              {stockLabel}
            </Badge>
          ) : null}
          <Badge
            tone={product.unavailable ? "danger" : "success"}
            className="text-[10px]"
          >
            {product.unavailable ? "NA" : "A"}
          </Badge>
        </div>
        {product.unavailable ? (
          <p
            aria-disabled
            className="mt-auto flex min-h-11 items-center justify-center rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] py-2 text-xs font-medium text-[var(--ob-text-muted)]"
          >
            Unavailable
          </p>
        ) : (
          <Button
            type="button"
            variant={inCartQty > 0 ? "secondary" : "primary"}
            className="mt-auto min-h-11 w-full py-2 text-xs"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {inCartQty > 0 ? addAnotherLabel : addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
