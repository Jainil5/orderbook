'use client';

import { cafe } from './cafe';
import { Reveal } from './Reveal';
import { SunriseMark } from './SunriseMark';

export function Story() {
  return (
    <section id="story" className="bc-story relative scroll-mt-20 overflow-hidden py-20 sm:py-24">
      <div aria-hidden className="bc-story-glow absolute inset-0" />
      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <Reveal>
          <h2 className="sr-only">The story behind the counter</h2>
          <SunriseMark className="mx-auto h-9 w-9 text-[var(--bc-honey)]" />
          <blockquote className="bc-serif mt-8 text-2xl italic leading-snug text-[var(--bc-cream)] sm:text-[2rem]">
            “A coffee bar lives or dies by the first shot of the day. Everything else on this
            counter is just waiting for the light to come up.”
          </blockquote>
          <p className="bc-display mt-6 text-[11px] uppercase tracking-[0.26em] text-[var(--bc-honey)]">
            Why we dial in before dawn
          </p>
        </Reveal>

        <Reveal delay={120}>
          <p className="mx-auto mt-8 max-w-2xl leading-relaxed text-[#fbf4e9]/75">
            {cafe.story}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
