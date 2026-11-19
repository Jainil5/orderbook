import { Mail, MapPin, Phone, Quote, Star } from "lucide-react";
import { LoopRow } from "@/components/effects/loop-row";
import { siteCaption, type SiteTestimonial } from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";
import { SiteReveal } from "./site-chrome";

/**
 * Section header in the reference sites' idiom: a kicker, one statement line,
 * and a count line that comes from the data ("15 lines, and every one of them
 * priced"). The `id` is what the sticky anchor nav scrolls to.
 */
export function SiteRule({
  id,
  kicker,
  title,
  count,
  intro,
}: {
  id: string;
  kicker: string;
  title: string;
  count?: string;
  intro?: string;
}) {
  return (
    <header id={id} className="scroll-mt-24">
      <SiteReveal>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--site-accent)]">
          {kicker}
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <h2 className="site-display max-w-3xl text-3xl sm:text-5xl">{title}</h2>
          {count ? (
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--site-muted)]">
              {count}
            </p>
          ) : null}
        </div>
        {intro ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--site-muted)]">
            {intro}
          </p>
        ) : null}
      </SiteReveal>
    </header>
  );
}

/** The long-form block with the pull-quote the reference sites lead rooms with. */
export function SiteStory({ profile }: { profile: SiteProfile }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <p className="site-quote">
          <Quote className="mb-4 h-6 w-6 text-[var(--site-accent)]" aria-hidden />
          {profile.pullQuote}
        </p>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--site-muted)]">
          {profile.pullQuoteBy}
        </p>
      </div>
      <SiteReveal delay={0.1}>
        <div className="grid gap-3">
          {profile.highlights.map((highlight) => (
            <div
              key={highlight.title}
              className="site-spot p-5"
            >
              <p className="text-sm font-semibold">{highlight.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--site-muted)]">
                {highlight.body}
              </p>
            </div>
          ))}
        </div>
      </SiteReveal>
    </div>
  );
}

/** The testimonial belt, with the caption that says it is the same few notes. */
export function SiteVoices({
  profile,
  testimonials,
}: {
  profile: SiteProfile;
  testimonials: SiteTestimonial[];
}) {
  if (!testimonials.length) return null;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <h2 className="site-display text-3xl sm:text-4xl">
          {profile.voicesKicker}
        </h2>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--site-muted)]">
          {siteCaption(profile.beltCaption, testimonials.length)}
        </p>
      </div>
      <div className="mt-8">
        <LoopRow
          ariaLabel={`${profile.name} reviews`}
          speed={20}
          items={testimonials.map((testimonial) => (
            <figure
              key={`${testimonial.when}-${testimonial.source}`}
              className="site-spot w-80 p-5"
            >
              <div
                className="flex gap-0.5 text-[var(--site-accent)]"
                aria-label={`${testimonial.rating} out of 5`}
              >
                {Array.from({ length: testimonial.rating }).map((_, index) => (
                  <Star key={index} className="h-3.5 w-3.5 fill-current" aria-hidden />
                ))}
              </div>
              <blockquote className="mt-3 text-sm leading-relaxed">
                “{testimonial.text}”
              </blockquote>
              <figcaption className="mt-3 text-xs text-[var(--site-muted)]">
                {testimonial.source} · {testimonial.when}
              </figcaption>
            </figure>
          ))}
        />
      </div>
    </div>
  );
}

/** Hours, address, contacts, and what happens after the button is pressed. */
export function SiteVisit({
  profile,
  contactEmail,
  contactPhone,
}: {
  profile: SiteProfile;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <SiteReveal>
        <div className="site-spot overflow-hidden">
          <div className="site-kenburns h-44 w-full" aria-hidden />
          <div className="p-6">
            <h3 className="site-display text-2xl">{profile.visitTitle}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--site-muted)]">
              {profile.visitBody}
            </p>
            <ul className="mt-5 space-y-3">
              {profile.hoursRows.map((row) => (
                <li
                  key={row.day}
                  className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-[var(--site-line)] pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--site-muted)]">
                    {row.day}
                  </span>
                  <span
                    className={
                      row.time === "Closed"
                        ? "text-sm font-semibold text-[var(--site-accent)]"
                        : "text-sm font-semibold"
                    }
                  >
                    {row.time}
                  </span>
                  <span className="col-span-2 text-xs leading-relaxed text-[var(--site-muted)]">
                    {row.note}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-2 text-sm text-[var(--site-muted)]">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--site-accent)]" aria-hidden />
                {profile.address}
              </p>
              {contactEmail ? (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-[var(--site-accent)]" aria-hidden />
                  <a className="hover:text-[var(--site-accent)]" href={`mailto:${contactEmail}`}>
                    {contactEmail}
                  </a>
                </p>
              ) : null}
              {contactPhone ? (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[var(--site-accent)]" aria-hidden />
                  <a
                    className="hover:text-[var(--site-accent)]"
                    href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                  >
                    {contactPhone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </SiteReveal>

      <SiteReveal delay={0.1}>
        <ol className="space-y-4">
          {profile.nextSteps.map((step, index) => (
            <li key={step} className="site-spot flex gap-4 p-5">
              <span className="site-display text-2xl leading-none text-[var(--site-accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </SiteReveal>
    </div>
  );
}

/** Short notes from the bench — the reference sites' journal strip. */
export function SiteJournal({ profile }: { profile: SiteProfile }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {profile.journal.entries.map((entry) => (
        <article key={entry.title} className="site-spot p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--site-accent)]">
            {profile.journal.kicker}
          </p>
          <h3 className="mt-2 text-sm font-semibold leading-snug">{entry.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--site-muted)]">
            {entry.body}
          </p>
        </article>
      ))}
    </div>
  );
}
