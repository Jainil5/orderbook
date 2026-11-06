"use client";

import { useEffect, useRef } from "react";
import type { Product } from "@/types/database";
import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/products/product-thumbnail";
import { ProductPrice } from "@/components/products/product-price";
import { X } from "lucide-react";

/**
 * Tap-to-enlarge for the catalog. One instance is shared by every tile so the
 * photo, not the add-to-cart tap, owns the gesture.
 */
export function ProductPeekDialog({
  product,
  currencyCode,
  addLabel,
  onAdd,
  onClose,
}: {
  product: Product | null;
  currencyCode: string;
  addLabel: string;
  onAdd: (product: Product) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (product) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [product]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={product ? product.name : "Product"}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(100%,26rem)] bg-transparent p-0 text-left backdrop:bg-black/50"
    >
      {product ? (
        <div className="ob-animate-in max-h-[90dvh] overflow-hidden overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-surface)] shadow-[var(--ob-shadow-md)]">
          <div className="relative">
            <ProductThumbnail
              name={product.name}
              imageUrl={product.image_url}
              category={product.category}
              size="square"
              className="w-full"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-2 top-2 rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] p-1.5 text-[var(--ob-text-muted)] transition hover:bg-[var(--ob-surface-muted)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="space-y-2 p-4">
            <p className="text-sm font-semibold leading-snug">{product.name}</p>
            <div className="flex items-center justify-between gap-3">
              <ProductPrice product={product} currencyCode={currencyCode} />
              {product.category ? (
                <span className="text-xs text-[var(--ob-text-muted)]">
                  {product.category}
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onAdd(product);
                onClose();
              }}
            >
              {addLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
