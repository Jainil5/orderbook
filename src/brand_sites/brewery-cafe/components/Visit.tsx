'use client';

import Link from 'next/link';
import { ArrowRight, Clock, Mail, MapPin, Phone } from 'lucide-react';
import type { SiteBrand } from '@/lib/demo/site-brand';
import type { SiteHoursRow, SiteOpenState } from '../site/data';
import { cafe } from './cafe';
import { Reveal } from './Reveal';

export function Visit({
  brand,
  hours,
  open,
}: {
  brand: SiteBrand;
  hours: SiteHoursRow[];
  open: SiteOpenState;
}) {
  return (
    <section id="visit" className="scroll-mt-24 border-t border-[var(--bc-line)] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-2xl">
          <p className="bc-display text-[11px] uppercase tracking-[0.26em] text-[var(--bc-ember)]">
            Visit
          </p>
          <h2 className="bc-display mt-3 text-4xl text-[var(--bc-ink)] sm:text-5xl">
            Come in, or send someone
          </h2>
          <a href="#menu" className="focus-ring bc-btn bc-btn-ghost mt-6">
            Order from the board
          </a>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <div className="bc-card h-full p-7 sm:p-8">
              <h3 className="bc-display flex items-center gap-2.5 text-lg text-[var(--bc-ink)]">
                <Clock aria-hidden className="h-4 w-4 text-[var(--bc-ember)]" />
                Hours
              </h3>
              <dl className="mt-5 divide-y divide-[var(--bc-line)]">
                {hours.map((slot) => (
                  <div key={slot.days} className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="bc-display text-[13px] uppercase tracking-[0.14em] text-[var(--bc-muted)]">
                      {slot.days}
                    </dt>
                    <dd className="bc-display tabular-nums text-[var(--bc-ink)]">{slot.time}</dd>
                  </div>
                ))}
              </dl>
              <p
                className={`bc-display mt-5 inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[12px] uppercase tracking-[0.14em] ${
                  open.status === 'open'
                    ? 'bg-[var(--bc-green)] text-[#fbf4e9]'
                    : open.status === 'closing_soon'
                      ? 'bg-[var(--bc-honey)] text-[#2a1408]'
                      : 'bg-[#2a211b]/10 text-[#2a211b]/75'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    open.status === 'open'
                      ? 'bg-[#8fd6a1]'
                      : open.status === 'closing_soon'
                        ? 'bg-[var(--bc-ember)]'
                        : 'bg-[#2a211b]/45'
                  }`}
                />
                {open.label}
              </p>
              <p className="mt-5 text-sm leading-relaxed text-[var(--bc-muted)]">
                These are the hours the counter keeps, so they move when the kitchen does. Kitchen
                stops thirty minutes before the door does. When the trays go, they go — we write the
                time on the chalkboard.
              </p>
            </div>
          </Reveal>

          <div className="space-y-6">
            <Reveal delay={80}>
              <div className="bc-card p-7">
                <h3 className="bc-display flex items-center gap-2.5 text-lg text-[var(--bc-ink)]">
                  <MapPin aria-hidden className="h-4 w-4 text-[var(--bc-ember)]" />
                  Where
                </h3>
                <p className="mt-4 leading-relaxed text-[var(--bc-muted)]">{cafe.where}</p>
                <ul className="mt-5 space-y-2">
                  {cafe.notes.map((note) => (
                    <li key={note} className="flex gap-2.5 text-sm text-[var(--bc-muted)]">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bc-apricot)]" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <div className="bc-card p-7">
                <h3 className="bc-display flex items-center gap-2.5 text-lg text-[var(--bc-ink)]">
                  <Mail aria-hidden className="h-4 w-4 text-[var(--bc-ember)]" />
                  Talk to the counter
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-[var(--bc-muted)]">
                  Trays of bagels, a table for six, or a change to an order already sent through —
                  write the day and the time and we will have it waiting.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  {brand.contactEmail ? (
                    <a
                      href={`mailto:${brand.contactEmail}?subject=Order%20ahead`}
                      className="focus-ring bc-btn bc-btn-solid"
                    >
                      {brand.contactEmail}
                    </a>
                  ) : null}
                  {brand.contactPhone ? (
                    <a
                      href={`tel:${brand.contactPhone.replace(/\s+/g, '')}`}
                      className="focus-ring bc-display inline-flex min-h-11 items-center gap-2 rounded text-sm text-[var(--bc-ink)]"
                    >
                      <Phone aria-hidden className="h-4 w-4 text-[var(--bc-ember)]" />
                      {brand.contactPhone}
                    </a>
                  ) : null}
                  <Link
                    href="/support"
                    className="focus-ring bc-display inline-flex min-h-11 items-center gap-2 rounded text-sm text-[var(--bc-ink)] hover:text-[var(--bc-ember)]"
                  >
                    <ArrowRight aria-hidden className="h-4 w-4 text-[var(--bc-ember)]" />
                    Track an order, or tell us something is wrong
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
