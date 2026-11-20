'use client';

import { instaFeed } from './instaFeed';
import { InstagramPost } from './InstagramPost';
import { Reveal } from './Reveal';

/**
 * The Instagram shelf. It renders nothing until `instaFeed.ts` holds real
 * posts from this brand's own account; each plate then falls back to an
 * "Open on Instagram" card if the embed refuses to render.
 */
export function Feed() {
  if (!instaFeed.length) return null;

  return (
    <section id="feed" className="bc-feed scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="bc-display text-[11px] uppercase tracking-[0.26em] text-[var(--bc-ember)]">
              On the gram
            </p>
            <h2 className="bc-display mt-3 text-4xl text-[var(--bc-ink)] sm:text-5xl">
              Fresh from the counter
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--bc-muted)]">
            Three plates we keep coming back to — posts and pours, straight from the feed.
          </p>
        </Reveal>

        <div className="bc-feed-grid mt-12">
          {instaFeed.map((post, i) => (
            <Reveal key={post.url} delay={i * 90}>
              <InstagramPost url={post.url} caption={post.caption} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
