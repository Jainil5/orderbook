'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { instaFeed } from './instaFeed';
import type { SiteOpenState } from '../site/data';
import { SunriseMark } from './SunriseMark';

/** One page, so every link is an anchor into the same scroll. */
const links = [
  { href: '#menu', label: 'Menu' },
  { href: '#story', label: 'Story' },
  { href: '#voices', label: 'Voices' },
  // The shelf only earns a link once real posts are configured under it.
  ...(instaFeed.length ? [{ href: '#feed', label: 'Instagram' }] : []),
  { href: '#room', label: 'The room' },
  { href: '#visit', label: 'Visit' },
];

/**
 * Whether the doors are open right now. It comes from the brand's own working
 * hours in Settings — the site never keeps a second copy of them, so moving
 * Friday's closing time in the workspace moves this line on the next load.
 */
const PILL_STYLE: Record<SiteOpenState['status'], string> = {
  open: 'bg-[var(--bc-green)] text-[#fbf4e9]',
  closing_soon: 'bg-[var(--bc-honey)] text-[#2a1408]',
  closed: 'bg-[#2a211b]/10 text-[#2a211b]/75',
};

const DOT_STYLE: Record<SiteOpenState['status'], string> = {
  open: 'bg-[#8fd6a1]',
  closing_soon: 'bg-[var(--bc-ember)]',
  closed: 'bg-[#2a211b]/45',
};

function OpenPill({ open }: { open: SiteOpenState }) {
  return (
    <span
      className={`bc-display inline-flex min-h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[12px] uppercase tracking-[0.14em] ${PILL_STYLE[open.status]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_STYLE[open.status]}`} />
      {open.label}
    </span>
  );
}

export function Nav({
  open: openState,
  onOrderClick,
}: {
  open: SiteOpenState;
  onOrderClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 40);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="bg-[var(--bc-green)] text-center">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-1">
          <Link
            href="/"
            className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded text-[11px] font-semibold uppercase tracking-[0.18em] text-[#fbf4e9]/80 transition-colors hover:text-[#fbf4e9]"
          >
            <ArrowLeft aria-hidden className="h-3 w-3" />
            Back to the OrderBook workspace
          </Link>
        </div>
      </div>

      <header
        aria-label="Main"
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'border-b border-[var(--bc-line)] bg-[#fbf4e9]/90 backdrop-blur-md'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/menu" className="focus-ring bc-brand group flex min-h-10 items-center gap-2.5">
            <SunriseMark className="h-7 w-7 text-[var(--bc-ember)]" />
            <span className="bc-display text-xl leading-none">
              <span className="bc-serif italic font-normal text-[var(--bc-ember)]">Brewery</span>
              <span className="ml-1 uppercase tracking-[0.14em]">Cafe</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="focus-ring bc-display rounded text-[13px] uppercase tracking-[0.16em] text-[#2a211b]/70 transition-colors hover:text-[var(--bc-ember)]"
              >
                {l.label}
              </a>
            ))}
            <span className="hidden md:inline-flex">
              <OpenPill open={openState} />
            </span>
            <button type="button" onClick={onOrderClick} className="focus-ring bc-btn bc-btn-solid">
              Place order
            </button>
          </nav>

          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="focus-ring bc-display inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--bc-ink)] md:hidden"
          >
            {open ? <X aria-hidden className="h-6 w-6" /> : <Menu aria-hidden className="h-6 w-6" />}
          </button>
        </div>

        {/* Phones get the status on its own line — no room for it beside the
            wordmark and the menu button. */}
        <div className="border-t border-[var(--bc-line)] bg-[#fbf4e9]/85 px-5 py-1.5 backdrop-blur-md md:hidden">
          <OpenPill open={openState} />
        </div>

        {open ? (
          <div className="border-t border-[var(--bc-line)] bg-[var(--bc-cream)] px-5 py-3 md:hidden">
            <div className="flex flex-col">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="focus-ring bc-display flex min-h-11 items-center rounded text-sm uppercase tracking-[0.16em] text-[#2a211b]/80"
                >
                  {l.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOrderClick();
                }}
                className="focus-ring bc-btn bc-btn-solid mt-2 w-full"
              >
                Place order
              </button>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
