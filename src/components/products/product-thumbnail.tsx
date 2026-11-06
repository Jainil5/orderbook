"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Package } from "lucide-react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const sizeClasses = {
  /** Table / cart line */
  sm: "h-10 w-12 rounded-[var(--ob-radius-md)]",
  /** Product list */
  md: "h-12 w-14 rounded-[var(--ob-radius-md)]",
  /** POS catalog tile, full-bleed top block */
  square: "aspect-square w-full border-0 rounded-none",
} as const;

const tagTones = [
  "ob-tag-navy",
  "ob-tag-teal",
  "ob-tag-amber",
  "ob-tag-violet",
  "ob-tag-slate",
] as const;

/**
 * Same category, same tint, so a shelf of unphotographed stock reads as one
 * group instead of random noise.
 */
function tagTone(category?: string | null): string {
  const key = category?.trim().toLowerCase() || "uncategorised";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return tagTones[Math.abs(hash) % tagTones.length];
}

export function ProductThumbnail({
  name,
  imageUrl,
  size = "md",
  category,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof sizeClasses;
  category?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl?.trim()) && !failed;
  const labelled = size === "square";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-[var(--ob-border)] bg-[var(--ob-surface-muted)]",
        sizeClasses[size],
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied URLs
        <img
          src={imageUrl!.trim()}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : labelled ? (
        <div
          className={cn(
            "ob-tag flex h-full w-full items-center justify-center",
            tagTone(category),
          )}
          aria-hidden
        >
          <span className="font-mono text-lg font-semibold tracking-tight text-[var(--ob-text-muted)]">
            {initials(name)}
          </span>
        </div>
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[var(--ob-text-muted)]"
          aria-hidden
        >
          <Package className="h-5 w-5 opacity-60" strokeWidth={1.5} />
          <span className="text-[10px] font-semibold">{initials(name)}</span>
        </div>
      )}
    </div>
  );
}
