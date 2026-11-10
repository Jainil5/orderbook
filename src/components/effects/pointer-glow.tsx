"use client";

import type { PointerEvent, ReactNode } from "react";

/** Cursor-following radial highlight. The glow layer itself is aria-hidden
 *  and pointer-events-none; only the host receives pointer moves. */
export function PointerGlow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--ob-glow-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--ob-glow-y",
      `${event.clientY - rect.top}px`,
    );
  };
  return (
    <div
      className={`ob-glow-host relative ${className ?? ""}`}
      onPointerMove={onPointerMove}
    >
      {children}
      <span className="ob-glow-layer" aria-hidden />
    </div>
  );
}
