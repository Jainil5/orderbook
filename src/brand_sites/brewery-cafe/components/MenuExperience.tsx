'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import Image from 'next/image';
import type { SiteBrand } from '@/lib/demo/site-brand';
import { isRecommended, type MenuGroup } from './menu';
import { cartQtyForItem, type CartAction, type CartState, type Tray } from './cart';
import { BeansField } from './BeansField';
import { OrderTray } from './OrderTray';
import { ItemDialog } from './ItemDialog';
import { BarrelGallery } from './BarrelGallery';
import { ComboBuilder } from './ComboBuilder';
import { Reveal } from './Reveal';

type Mode = 'genz' | 'trad';
type Section = 'all' | 'combo' | string;

interface MenuExperienceProps {
  brand: SiteBrand;
  groups: MenuGroup[];
  tray: Tray;
  cart: CartState;
  dispatch: (action: CartAction) => void;
  trayOpen: boolean;
  onTrayOpenChange: (open: boolean) => void;
}

const TILT_DEG = 7;
const DRIFT_PX = 10;

// 3D lean toward the cursor; CSS only applies it under (hover: hover),
// and phones never fire pointermove over a still card.
function tiltTo(e: PointerEvent<HTMLButtonElement>) {
  if (!window.matchMedia('(hover: hover)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t = e.currentTarget;
  const r = t.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  t.style.setProperty('--ry', `${(x * 2 * TILT_DEG).toFixed(2)}deg`);
  t.style.setProperty('--rx', `${(-y * 2 * TILT_DEG).toFixed(2)}deg`);
  t.style.setProperty('--px', `${(-x * DRIFT_PX).toFixed(1)}px`);
  t.style.setProperty('--py', `${(-y * DRIFT_PX).toFixed(1)}px`);
}

function untilt(e: PointerEvent<HTMLButtonElement>) {
  const style = e.currentTarget.style;
  for (const v of ['--rx', '--ry', '--px', '--py']) style.removeProperty(v);
}

function MenuStar({ label }: { label: string }) {
  return (
    <span className="bc-card-star" aria-hidden>
      <svg viewBox="0 0 24 24" className="bc-star-icon" aria-hidden>
        <path
          d="M12 2.6l2.6 6 6.4.6-4.8 4.3 1.4 6.3L12 16.6 6.4 19.8l1.4-6.3L3 9.2l6.4-.6z"
          fill="currentColor"
        />
      </svg>
      <span className="bc-card-star-label">{label}</span>
    </span>
  );
}

/**
 * The board itself. Its sections are the catalog's own categories, so a new
 * category saved in the workspace appears here as its own tab on the next load.
 */
export function MenuExperience({
  brand,
  groups,
  tray,
  cart,
  dispatch,
  trayOpen,
  onTrayOpenChange,
}: MenuExperienceProps) {
  const [mode, setMode] = useState<Mode>('genz');
  const [cat, setCat] = useState<Section>(groups[0]?.id ?? 'all');
  const [openedId, setOpenedId] = useState<string | null>(null);

  const allItems = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ item, groupTitle: group.title }))),
    [groups],
  );
  // A section can disappear between loads (a category renamed at the counter),
  // so the active tab is resolved against what the catalog holds right now.
  const section = cat === 'all' || cat === 'combo' ? cat : (groups.find((g) => g.id === cat)?.id ?? 'all');
  const activeGroup = groups.find((g) => g.id === section);
  const visible = activeGroup
    ? activeGroup.items.map((item) => ({ item, groupTitle: activeGroup.title }))
    : allItems;
  const comboPair = useMemo(() => {
    const playable = groups.filter((g) => g.items.length > 1);
    return playable.length >= 2 ? ([playable[0], playable[1]] as const) : null;
  }, [groups]);
  const opened = openedId ? allItems.find((x) => x.item.id === openedId) : null;

  return (
    <section id="menu" aria-label="The menu" className="bc-menu relative scroll-mt-20">
      <div aria-hidden className="bc-pick-wash" />
      <div aria-hidden className="bc-stains" />
      <div aria-hidden className="bc-beans" />
      <BeansField />
      <div aria-hidden className="bc-hero-grain absolute inset-0" />

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 sm:pt-14">
        <h2 className="sr-only">{`${brand.name}, priced as the counter prices it`}</h2>
        <Reveal>
          <p className="bc-display text-[11px] uppercase tracking-[0.26em] text-[rgba(251,244,233,0.78)]">
            The whole board, priced the way the till prices it
          </p>
        </Reveal>

        {groups.length === 0 ? (
          <Reveal>
            <p className="bc-serif mt-10 max-w-md text-xl text-[var(--bc-paper)]">
              Nothing is on the board right now. The counter has the shutters down — try again when
              the next tray lands.
            </p>
          </Reveal>
        ) : (
          <div>
            <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
              <div className="min-w-0">
                <Reveal>
                  <div className="bc-tab-row">
                    <div className="bc-cat-tabs" role="tablist" aria-label="Menu section">
                      <button
                        type="button"
                        role="tab"
                        id="bc-tab-all"
                        aria-selected={section === 'all'}
                        aria-controls="bc-menu-board"
                        className="bc-display bc-cat-tab"
                        onClick={() => setCat('all')}
                      >
                        All
                      </button>
                      {groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          role="tab"
                          id={`bc-tab-${g.id}`}
                          aria-selected={section === g.id}
                          aria-controls="bc-menu-board"
                          className="bc-display bc-cat-tab"
                          onClick={() => setCat(g.id)}
                        >
                          {g.title}
                        </button>
                      ))}
                      {comboPair ? (
                        <button
                          type="button"
                          role="tab"
                          id="bc-tab-combo"
                          aria-selected={section === 'combo'}
                          aria-controls="bc-menu-board"
                          className="bc-display bc-cat-tab"
                          onClick={() => setCat('combo')}
                        >
                          Combo
                        </button>
                      ) : null}
                    </div>
                    <div className="bc-mode" role="group" aria-label="Menu style">
                      <span
                        aria-hidden
                        className="bc-mode-pill"
                        style={{ '--pos': mode === 'genz' ? 0 : 1 } as CSSProperties}
                      />
                      {(['genz', 'trad'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={m === mode}
                          className="bc-display bc-mode-btn"
                          onClick={() => setMode(m)}
                        >
                          {m === 'genz' ? 'Gen Z' : 'Traditional'}
                        </button>
                      ))}
                    </div>
                  </div>
                </Reveal>

                <div
                  id="bc-menu-board"
                  role="tabpanel"
                  aria-labelledby={`bc-tab-${section}`}
                >
                  <Reveal>
                    {mode === 'trad' ? (
                      <div className="bc-menu-list">
                        {(section === 'all' || section === 'combo'
                          ? groups
                          : groups.filter((g) => g.id === section)
                        ).map((group) => (
                          <section key={group.id} aria-label={group.title}>
                            <h2 className="bc-serif bc-list-heading">{group.title}</h2>
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="bc-list-row"
                                onClick={() => setOpenedId(item.id)}
                                disabled={!item.available}
                                aria-label={`${item.name}, ${item.price}, ${group.title}. ${
                                  item.available ? 'Open for details' : 'Not on today'
                                }`}
                              >
                                <span className="bc-list-thumb">
                                  <Image
                                    src={item.src}
                                    alt=""
                                    width={96}
                                    height={96}
                                    className="!h-full !w-full object-cover"
                                  />
                                </span>
                                <span className="bc-list-name">{item.name}</span>
                                {isRecommended(item) ? (
                                  <span className="bc-list-star" aria-hidden>
                                    ★
                                  </span>
                                ) : null}
                                <span className="bc-list-leader" aria-hidden />
                                {cartQtyForItem(cart, item.id) ? (
                                  <span
                                    className="bc-list-qty"
                                    aria-label={`${cartQtyForItem(cart, item.id)} on your tray`}
                                  >
                                    {cartQtyForItem(cart, item.id)}
                                  </span>
                                ) : null}
                                <span className="bc-list-price">{item.price}</span>
                              </button>
                            ))}
                          </section>
                        ))}
                      </div>
                    ) : section === 'all' ? (
                      <div className="bc-square-grid">
                        {visible.map(({ item, groupTitle }, i) => (
                          <button
                            key={item.id}
                            type="button"
                            className="bc-tile"
                            data-unavailable={item.available ? undefined : 'true'}
                            style={{ '--i': i } as CSSProperties}
                            onClick={() => setOpenedId(item.id)}
                            onPointerMove={tiltTo}
                            onPointerLeave={untilt}
                            aria-label={`${item.name}, ${item.price}, ${groupTitle}. ${
                              item.available ? 'Open for details' : 'Not on today'
                            }`}
                          >
                            <span className="bc-tile-img">
                              <Image
                                src={item.src}
                                alt=""
                                width={480}
                                height={480}
                                priority={i < 4}
                                loading={i < 4 ? undefined : 'lazy'}
                                className="!h-full !w-full object-cover"
                              />
                            </span>
                            {isRecommended(item) ? (
                              <MenuStar label={item.badge ?? 'House pick'} />
                            ) : null}
                            <span className="bc-tile-cat">{groupTitle}</span>
                            <span className="bc-tile-cap">
                              <span className="bc-tile-name">{item.name}</span>
                              <span className="bc-tile-price">
                                {item.price}
                                {item.wasPrice ? (
                                  <span className="bc-tile-was">{item.wasPrice}</span>
                                ) : null}
                              </span>
                              <span className="bc-tile-note">{item.note}</span>
                            </span>
                            {cartQtyForItem(cart, item.id) ? (
                              <span
                                className="bc-tile-qty"
                                aria-label={`${cartQtyForItem(cart, item.id)} on your tray`}
                              >
                                {cartQtyForItem(cart, item.id)}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : section === 'combo' && comboPair ? (
                      <ComboBuilder
                        tray={tray}
                        dispatch={dispatch}
                        left={comboPair[0]}
                        right={comboPair[1]}
                      />
                    ) : (
                      /* One section at a time goes on the barrel: the cards stand
                         around a cylinder and the customer spins the board. */
                      <BarrelGallery
                        key={section}
                        label={activeGroup?.title ?? 'Menu'}
                        entries={visible}
                        cart={cart}
                        onOpen={setOpenedId}
                      />
                    )}
                  </Reveal>
                </div>

                <Reveal delay={80}>
                  <div className="bc-menu-foot">
                    <div className="flex flex-wrap gap-3">
                      <a href="#visit" className="focus-ring bc-btn bc-btn-cream">
                        Find the door
                      </a>
                      <a href="#room" className="focus-ring bc-btn bc-btn-ghost">
                        See the room
                      </a>
                    </div>
                  </div>
                </Reveal>
              </div>

              <OrderTray
                brand={brand}
                tray={tray}
                cart={cart}
                dispatch={dispatch}
                open={trayOpen}
                onOpenChange={onTrayOpenChange}
              />
            </div>
          </div>
        )}
      </div>

      {opened ? (
        <ItemDialog
          item={opened.item}
          tray={tray}
          groupTitle={opened.groupTitle}
          qty={cartQtyForItem(cart, opened.item.id)}
          dispatch={dispatch}
          onClose={() => setOpenedId(null)}
        />
      ) : null}
    </section>
  );
}
