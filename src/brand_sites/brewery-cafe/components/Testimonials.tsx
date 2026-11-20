'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MenuGroup } from './menu';
import type { Voice } from './voices';
import { BeansField } from './BeansField';
import { Reveal } from './Reveal';

const AUTOPLAY_MS = 5000;

export function Testimonials({ groups, voices }: { groups: MenuGroup[]; voices: Voice[] }) {
  const itemsById = useMemo(
    () => new Map(groups.flatMap((g) => g.items).map((item) => [item.id, item] as const)),
    [groups],
  );
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  // One measurement drives both the CSS card width and the track offset, so
  // the two can never disagree about where a card ends.
  const [metrics, setMetrics] = useState({ perView: 1, cardW: 0, gap: 20 });

  const pageCount = Math.max(1, voices.length - metrics.perView + 1);
  // The last page shrinks as the viewport widens, so the cursor is read
  // clamped rather than rewritten from an effect.
  const page = Math.min(cursor, pageCount - 1);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const perView = w < 768 ? 1 : 2;
      const gap = perView === 1 ? 20 : 24;
      setMetrics({ perView, gap, cardW: (w - gap * (perView - 1)) / perView });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback(
    (delta: number) => setCursor((page + delta + pageCount) % pageCount),
    [page, pageCount],
  );

  useEffect(() => {
    if (userPaused || hovering || reduceMotion || pageCount <= 1) return;
    const timer = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [userPaused, hovering, reduceMotion, pageCount, go]);

  const offset = -page * (metrics.cardW + metrics.gap);

  // No reviews yet means nothing honest to put on the wall.
  if (!voices.length) return null;

  return (
    <section
      id="voices"
      aria-roledescription="carousel"
      aria-label="What the regulars say"
      className="bc-voices-section relative scroll-mt-20 overflow-hidden py-20 sm:py-24"
    >
      <BeansField />
      <div className="relative mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <p className="bc-display text-[11px] uppercase tracking-[0.26em] text-[var(--bc-honey)]">
            Word of mouth
          </p>
          <h2 className="bc-display mt-3 text-4xl text-[var(--bc-paper)] sm:text-5xl">
            What the regulars say
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[rgba(251,244,233,0.72)]">
            Everything the counter has been sent word about, straight out of the review inbox. The
            shelf drifts on its own; drag it, or use the arrows to pick the pace.
          </p>
        </Reveal>

        <div
          className="bc-carousel mt-14"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setHovering(true)}
          onBlur={() => setHovering(false)}
        >
          <button
            type="button"
            aria-label="Previous testimonials"
            onClick={() => go(-1)}
            className="focus-ring bc-carousel-btn bc-carousel-btn-left"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>

          <div ref={viewportRef} className="bc-carousel-viewport">
            <motion.div
              className="bc-carousel-track"
              style={
                {
                  '--card-w': metrics.cardW ? `${metrics.cardW}px` : '100%',
                  '--gap': `${metrics.gap}px`,
                } as CSSProperties
              }
              drag="x"
              dragConstraints={{ left: offset, right: offset }}
              dragElastic={0.06}
              dragMomentum={false}
              animate={{ x: offset }}
              transition={{ type: 'spring', stiffness: 170, damping: 26 }}
            >
              {voices.map((t, i) => {
                const item = t.productId ? itemsById.get(t.productId) : undefined;
                const inWindow = i >= page && i < page + metrics.perView;
                return (
                  <div key={t.name} className="bc-carousel-card" aria-hidden={!inWindow}>
                    <span className="bc-voice-top">
                      <span aria-hidden className="bc-voice-avatar">
                        {t.name.charAt(0)}
                      </span>
                      <span>
                        <span className="bc-voice-name">{t.name}</span>
                        <span className="bc-voice-when">{t.when}</span>
                      </span>
                    </span>
                    <span className="bc-voice-quote bc-serif">“{t.quote}”</span>
                    {item && (
                      <span className="bc-voice-tag">
                        <Image
                          src={item.src}
                          alt=""
                          width={64}
                          height={64}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        {item.name}
                      </span>
                    )}
                    {inWindow ? (
                      <span className="sr-only">
                        Review {i + 1} of {voices.length}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </motion.div>
          </div>

          <button
            type="button"
            aria-label="Next testimonials"
            onClick={() => go(1)}
            className="focus-ring bc-carousel-btn bc-carousel-btn-right"
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="bc-carousel-foot mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <button
            type="button"
            aria-pressed={userPaused}
            aria-label={userPaused ? 'Resume the testimonials' : 'Pause the testimonials'}
            onClick={() => setUserPaused((p) => !p)}
            className="focus-ring bc-carousel-pause"
          >
            {userPaused ? 'Play' : 'Pause'}
          </button>
          <div
            role="tablist"
            aria-label="Choose a testimonial page"
            className="bc-carousel-dots flex flex-wrap justify-center gap-2.5"
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === page}
                aria-label={`Go to testimonial page ${i + 1}`}
                onClick={() => setCursor(i)}
                className="focus-ring bc-carousel-dot"
                data-active={i === page ? 'true' : 'false'}
              />
            ))}
          </div>
        </div>

        <Reveal className="mt-16 text-center">
          <a href="#menu" className="focus-ring bc-btn bc-btn-solid">
            Order what they are talking about
          </a>
        </Reveal>
      </div>
    </section>
  );
}
