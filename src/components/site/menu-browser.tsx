"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Flame, Plus } from "lucide-react";
import { LoopRow } from "@/components/effects/loop-row";
import { formatMoney } from "@/lib/format";
import {
  buildRails,
  buildShelfCounts,
  type SiteMenuItem,
  type SiteMenuSection,
} from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";
import { SiteRule } from "./site-editorial";
import { useCart } from "./cart-provider";

/**
 * The public card, grouped exactly like the counter's catalog: the sections
 * are the products' own categories, the prices carry the products' default
 * discounts, and the modifier chips are the same Size/Add-on groups Billing
 * asks for. Adding here builds the same priced line the POS would, and every
 * badge, count and detail line on a card is derived from the pack.
 */
export function MenuBrowser({
  sections,
  profile,
  currencyCode,
}: {
  sections: SiteMenuSection[];
  profile: SiteProfile;
  currencyCode: string;
}) {
  const [active, setActive] = useState<string>("all");
  const visible = useMemo(
    () =>
      active === "all" ? sections : sections.filter((s) => s.category === active),
    [active, sections],
  );
  const counts = useMemo(() => buildShelfCounts(sections), [sections]);
  const rails = useMemo(() => buildRails(sections), [sections]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <SiteRule
        id="card"
        kicker={profile.menuTab}
        title={profile.shelfTitle}
        count={`${counts.lines} ${profile.summaryWords.lines} · from ${
          counts.cheapest == null
            ? "—"
            : formatMoney(counts.cheapest, currencyCode)
        } · every one priced from the ledger`}
        intro={profile.shelfIntro}
      />

      {rails.length ? (
        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="site-display text-xl">{profile.railTitle}</h3>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--site-muted)]">
              {profile.railCaption}
            </p>
          </div>
          <div className="mt-5">
            <LoopRow
              ariaLabel={`${profile.railTitle}, ${profile.name}`}
              speed={24}
              items={rails.map((item) => (
                <RailCard
                  key={item.id}
                  item={item}
                  currencyCode={currencyCode}
                  onJump={() => setActive(item.category)}
                />
              ))}
            />
          </div>
        </div>
      ) : null}

      {/* Category tiles — the shelf map, counted from the same rows. */}
      <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CategoryTile
          label="Everything"
          count={counts.lines}
          active={active === "all"}
          onClick={() => setActive("all")}
        />
        {sections.map((section) => (
          <CategoryTile
            key={section.category}
            label={section.category}
            count={section.items.length}
            image={section.items.find((item) => item.imageUrl)?.imageUrl ?? null}
            active={active === section.category}
            onClick={() => setActive(section.category)}
          />
        ))}
      </div>

      <div className="mt-12 space-y-14">
        {visible.map((section) => (
          <div key={section.category}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="site-display text-2xl">{section.category}</h3>
              <span className="text-xs text-[var(--site-muted)]">
                {section.items.length}{" "}
                {profile.madeToOrder ? "pieces" : "items"}
              </span>
            </div>
            {section.blurb ? (
              <p className="mt-1.5 text-sm text-[var(--site-muted)]">
                {section.blurb}
              </p>
            ) : null}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  profile={profile}
                  currencyCode={currencyCode}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryTile({
  label,
  count,
  image,
  active,
  onClick,
}: {
  label: string;
  count: number;
  image?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-active={active}
      className="site-spot group overflow-hidden p-0 text-left transition data-[active=true]:border-[var(--site-accent)]"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-20 w-full object-cover opacity-80 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
        />
      ) : (
        <div className="h-20 w-full bg-[var(--site-surface-strong)]" aria-hidden />
      )}
      <span className="block px-3 py-2.5">
        <span className="block truncate text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11px] text-[var(--site-muted)]">
          {count}
        </span>
      </span>
    </button>
  );
}

function RailCard({
  item,
  currencyCode,
  onJump,
}: {
  item: SiteMenuItem;
  currencyCode: string;
  onJump: () => void;
}) {
  return (
    <div className="site-spot w-64 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--site-accent)]">
          {item.category}
        </p>
        <p className="text-xs text-[var(--site-muted)]">
          {item.orderedQty > 0 ? `×${item.orderedQty}` : "new"}
        </p>
      </div>
      <p className="mt-2 font-semibold leading-snug">{item.name}</p>
      <p className="mt-1 text-sm text-[var(--site-accent)]">
        {formatMoney(item.price, currencyCode)}
        {item.unit ? ` / ${item.unit}` : ""}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--site-muted)]">
        {item.detail}
      </p>
      <button
        type="button"
        onClick={onJump}
        className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--site-muted)] transition hover:text-[var(--site-accent)]"
      >
        See all {item.category}
      </button>
    </div>
  );
}

function MenuCard({
  item,
  profile,
  currencyCode,
}: {
  item: SiteMenuItem;
  profile: SiteProfile;
  currencyCode: string;
}) {
  const { add } = useCart();
  const [picks, setPicks] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const group of item.modifiers) {
      initial[group.id] =
        group.type === "single"
          ? [group.options.find((o) => o.default)?.id ?? group.options[0]?.id ?? ""]
          : [];
    }
    return initial;
  });
  const [added, setAdded] = useState(false);

  const toggle = (groupId: string, optionId: string, type: "single" | "multi") => {
    setPicks((prev) => {
      if (type === "single") return { ...prev, [groupId]: [optionId] };
      const current = prev[groupId] ?? [];
      return {
        ...prev,
        [groupId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const lineModifierIds = useMemo(() => {
    const picked: string[] = [];
    for (const group of item.modifiers) {
      for (const id of picks[group.id] ?? []) {
        if (id) picked.push(id);
      }
    }
    return picked;
  }, [item.modifiers, picks]);

  const unitPrice = useMemo(() => {
    let delta = 0;
    for (const group of item.modifiers) {
      for (const option of group.options) {
        if (lineModifierIds.includes(option.id)) delta += option.price;
      }
    }
    return Math.max(0, item.price + delta);
  }, [item.price, item.modifiers, lineModifierIds]);

  const onAdd = () => {
    if (item.soldOut) return;
    add({ productId: item.id, quantity: 1, modifierIds: lineModifierIds });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className="site-spot group flex flex-col overflow-hidden">
      <div className="relative">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="aspect-[4/3] w-full bg-[var(--site-surface-strong)]" />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {item.popular ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--site-accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--site-accent-ink)]">
              <Flame className="h-3 w-3" aria-hidden /> {profile.popularBadge}
            </span>
          ) : null}
          {item.discountPercent ? (
            <span className="rounded-full bg-[var(--site-surface-strong)] px-2 py-0.5 text-[10px] font-bold backdrop-blur">
              −{item.discountPercent}%
            </span>
          ) : null}
          {item.soldOut ? (
            <span className="rounded-full bg-[var(--site-surface-strong)] px-2 py-0.5 text-[10px] font-bold backdrop-blur">
              {profile.soldOutBadge}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-semibold leading-snug">{item.name}</h4>
          <p className="text-right">
            {item.discountPercent ? (
              <span className="mr-1.5 text-xs line-through opacity-60">
                {formatMoney(item.listPrice, currencyCode)}
              </span>
            ) : null}
            <span className="whitespace-nowrap font-semibold text-[var(--site-accent)]">
              {formatMoney(unitPrice, currencyCode)}
            </span>
          </p>
        </div>
        {item.description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--site-muted)]">
            {item.description}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--site-muted)]">
          {item.detail}
        </p>

        {item.modifiers.length ? (
          <div className="mt-4 space-y-3">
            {item.modifiers.map((group) => (
              <div key={group.id}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--site-muted)]">
                  {group.name}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.options.map((option) => {
                    const selected = (picks[group.id] ?? []).includes(option.id);
                    const delta =
                      option.price === 0
                        ? ""
                        : ` ${option.price > 0 ? "+" : "−"}${formatMoney(
                            Math.abs(option.price),
                            currencyCode,
                          )}`;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggle(group.id, option.id, group.type)}
                        data-active={selected}
                        className="rounded-full border px-2.5 py-1 text-xs transition data-[active=true]:border-[var(--site-accent)] data-[active=true]:bg-[var(--site-accent-soft)] data-[active=true]:text-[var(--site-accent)]"
                      >
                        {option.name}
                        {delta ? (
                          <span className="ml-1 opacity-80">{delta}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={onAdd}
            disabled={item.soldOut}
            data-active={added}
            className="ob-press inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--site-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:brightness-110 data-[active=true]:bg-[color-mix(in_srgb,var(--site-accent)_70%,white)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              {added ? (
                <motion.span
                  key="added"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-2"
                >
                  <Check className="h-4 w-4" aria-hidden /> Added to cart
                </motion.span>
              ) : (
                <motion.span
                  key="add"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add to cart
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </article>
  );
}
