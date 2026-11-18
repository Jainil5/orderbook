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
    /* The card's box is read when the cursor enters it and again whenever the
       layout can have moved underneath it — never per pointer frame, because a
       getBoundingClientRect on every move forces a synchronous reflow, which is
       exactly what made moving the mouse across the page feel like stutter. */
    let measured: HTMLElement | null = null;
    let left = 0;
    let top = 0;

    const measure = (card: HTMLElement) => {
      const rect = card.getBoundingClientRect();
      left = rect.left;
      top = rect.top;
      measured = card;
    };

    const apply = (card: HTMLElement) => {
      frame = 0;
      if (measured !== card) measure(card);
      card.style.setProperty("--ob-glow-x", `${lastX - left}px`);
      card.style.setProperty("--ob-glow-y", `${lastY - top}px`);
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
      if (measured !== card) measure(card);
      lastX = event.clientX;
      lastY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => apply(card));
    };

    const clear = () => {
      if (current) current.classList.remove("ob-card-glow");
      current = null;
    };

    /* Any scroll or resize invalidates every cached box; the next move that
       lands on a card re-reads just that one. */
    const invalidate = () => {
      measured = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", clear);
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
