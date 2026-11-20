'use client';

import Image from 'next/image';
import { galleryShots } from './cafe';
import { Reveal } from './Reveal';

/**
 * The room, pinned to a board: shots overlap and sit off-square so the grid
 * never reads as a template gallery. Hover straightens and lifts one.
 */
export function Mosaic() {
  return (
    <section id="room" className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="bc-display text-[11px] uppercase tracking-[0.26em] text-[var(--bc-ember)]">
              The room
            </p>
            <h2 className="bc-display mt-3 text-4xl text-[var(--bc-ink)] sm:text-5xl">
              Sixteen seats and a window ledge
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--bc-muted)]">
            Shot across one ordinary Tuesday, from the first tray to the last soup of the afternoon.
          </p>
        </Reveal>

        <div className="bc-mosaic mt-12">
          {galleryShots.map((shot, i) => (
            <Reveal
              key={shot.src}
              delay={i * 70}
              className={shot.tall ? 'bc-mosaic-tall' : undefined}
            >
              <figure className="bc-shot" style={{ ['--tilt' as string]: `${shot.rotate}deg` }}>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  width={shot.w}
                  height={shot.h}
                  sizes="(max-width: 768px) 92vw, (max-width: 1024px) 46vw, 33vw"
                  className="h-full w-full object-cover"
                />
                <figcaption className="bc-shot-caption bc-display">
                  <span aria-hidden className="bc-shot-dot" />
                  {shot.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
