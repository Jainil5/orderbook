"use client";

import { useEffect } from "react";

/**
 * App-wide cursor glow for every `.ob-card`. One delegated document listener
 * instead of per-card pointer tracking; the CSS lives on `.ob-card::after`.
 */
export function CardGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let current: HTMLElement | null = null;
    let frame = 0;
    let lastX = 0;
    let lastY = 0;

    const apply = (card: HTMLElement) => {
      frame = 0;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--ob-glow-x", `${lastX - rect.left}px`);
      card.style.setProperty("--ob-glow-y", `${lastY - rect.top}px`);
      card.classList.add("ob-card-glow");
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(".ob-card")
          : null;
      if (current && current !== card) {
        current.classList.remove("ob-card-glow");
      }
      current = card;
      if (!card) return;
      lastX = event.clientX;
      lastY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => apply(card));
    };

    const clear = () => {
      if (current) current.classList.remove("ob-card-glow");
      current = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", clear);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
