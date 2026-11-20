import type { SiteBrand } from '@/lib/demo/site-brand';
import { cafe } from './cafe';
import { instaFeed } from './instaFeed';
import { SunriseMark } from './SunriseMark';

const links = [
  { href: '#menu', label: 'Menu' },
  { href: '#story', label: 'Story' },
  { href: '#voices', label: 'Voices' },
  ...(instaFeed.length ? [{ href: '#feed', label: 'Instagram' }] : []),
  { href: '#room', label: 'The room' },
  { href: '#visit', label: 'Visit' },
];

export function SiteFooter({ brand }: { brand: SiteBrand }) {
  return (
    <footer className="bc-footer">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <SunriseMark className="h-7 w-7 text-[var(--bc-honey)]" />
              <span className="bc-display text-xl leading-none text-[var(--bc-cream)]">
                <span className="bc-serif font-normal italic text-[var(--bc-honey)]">Brewery</span>
                <span className="ml-1 uppercase tracking-[0.14em]">Cafe</span>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#fbf4e9]/60">{cafe.tagline}</p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="focus-ring bc-display inline-flex min-h-10 items-center rounded text-[12px] uppercase tracking-[0.18em] text-[#fbf4e9]/70 transition-colors hover:text-[var(--bc-honey)]"
              >
                {l.label}
              </a>
            ))}
            {brand.contactEmail ? (
              <a
                href={`mailto:${brand.contactEmail}`}
                className="focus-ring bc-display inline-flex min-h-10 items-center rounded text-[12px] uppercase tracking-[0.18em] text-[#fbf4e9]/70 transition-colors hover:text-[var(--bc-honey)]"
              >
                {brand.contactEmail}
              </a>
            ) : null}
            {brand.contactPhone ? (
              <a
                href={`tel:${brand.contactPhone.replace(/\s+/g, '')}`}
                className="focus-ring bc-display inline-flex min-h-10 items-center rounded text-[12px] uppercase tracking-[0.18em] text-[#fbf4e9]/70 transition-colors hover:text-[var(--bc-honey)]"
              >
                {brand.contactPhone}
              </a>
            ) : null}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-[#fbf4e9]/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name}. Brewed daily, sold out by two most Saturdays.
          </p>
          <p className="bc-display uppercase tracking-[0.14em]">{cafe.where}</p>
        </div>
      </div>
    </footer>
  );
}
