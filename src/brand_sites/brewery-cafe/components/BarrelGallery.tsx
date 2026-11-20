'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from 'react';
import Image from 'next/image';
import { animate } from 'motion/react';
import { isRecommended, type MenuItem } from './menu';
import { cartQtyForItem } from './cart';
export interface BarrelEntry {
  item: MenuItem;
  groupTitle: string;
}

interface BarrelGalleryProps {
  /** Section name, used for the accessible labels — "Coffee", "Food". */
  label: string;
  entries: BarrelEntry[];
  /** Live tray counts, so a card can show what is already on the tray. */
  cart: Record<string, number>;
  /** Called when the customer commits to the card facing them. */
  onOpen: (id: string) => void;
}

/**
 * A 3D barrel gallery: the cards stand on the skin of a cylinder and the
 * cylinder spins. Geometry lives in CSS (radius, curvature, fade are all
 * derived from --rot and each card's own angle), so a spin writes exactly
 * one custom property per frame instead of touching every card.
 *
 * The same maths holds at 375px, so phones get the real barrel rather than
 * a shrunken desktop widget — they just drive it with a thumb (see
 * SWIPE_K, which is tuned so one card-width of drag is a hair under one step).
 */

// Dragging one card width should land just shy of the next card, so a
// thumb-length swipe covers about three items — fast, but never wild.
const SWIPE_K = 0.16;
// How far a fling may carry past the release point, in card steps.
const FLING_STEPS = 2.6;
// Wheel nudges are small; cap how far one burst can push the barrel.
const WHEEL_LIMIT = 1.5;
const SNAP_DELAY = 130;
// Idle drift: one slow card turn every few seconds, like a shop-window display.
const AUTO_MS = 4500;
const AUTO_START_MS = 900;
// How long the swipe hint stays up once the barrel scrolls into view.
const HINT_MS = 5200;

const still = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

function BarrelStar({ label }: { label: string }) {
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

export function BarrelGallery({ label, entries, cart, onOpen }: BarrelGalleryProps) {
  const n = entries.length;
  const step = 360 / n;

  const [active, setActive] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [hintArmed, setHintArmed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLUListElement>(null);
  const slotRef = useRef<HTMLLIElement>(null);
  /** Continuous position in card steps; the rotation is this times `step`. */
  const posRef = useRef(0);
  /** Same as `active`, readable from event handlers that fire mid-gesture. */
  const activeRef = useRef(0);
  const animRef = useRef<{ stop: () => void } | null>(null);
  const dragRef = useRef<{
    id: number;
    x0: number;
    pos0: number;
    lastT: number;
    v: number;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const movedRef = useRef(false);
  const snapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Once the customer touches the barrel, the idle drift stops for good. */
  const engagedRef = useRef(false);
  const hoveringRef = useRef(false);

  const wrap = useCallback((i: number) => ((i % n) + n) % n, [n]);

  const setRot = useCallback(
    (pos: number) => {
      ringRef.current?.style.setProperty('--rot', `${(-pos * step).toFixed(3)}deg`);
    },
    [step],
  );

  const stopAnim = () => {
    animRef.current?.stop();
    animRef.current = null;
  };

  /** Spin so `index` faces the customer, taking the short way round. */
  const spinTo = useCallback(
    (index: number, velocity = 0) => {
      const base = Math.round(posRef.current);
      let delta = index - wrap(base);
      if (delta > n / 2) delta -= n;
      if (delta < -n / 2) delta += n;
      const target = base + delta;
      setActive(wrap(target));
      activeRef.current = wrap(target);
      stopAnim();
      if (still()) {
        posRef.current = target;
        setRot(target);
        return;
      }
      animRef.current = animate(posRef.current, target, {
        type: 'spring',
        stiffness: 168,
        damping: 25,
        mass: 0.9,
        velocity,
        onUpdate: (v) => {
          posRef.current = v;
          setRot(v);
        },
      });
    },
    [n, setRot, wrap],
  );

  // Park the barrel on mount and release everything on unmount.
  useEffect(() => {
    setRot(posRef.current);
    return () => {
      stopAnim();
      if (snapRef.current) clearTimeout(snapRef.current);
    };
  }, [setRot]);

  const cardWidth = () => slotRef.current?.offsetWidth || 240;

  // The swipe hint's countdown starts when the barrel first scrolls into view.
  // Timing it from mount would have it gone before the customer gets here.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !showHint) return;
    const io = new IntersectionObserver(
      (rows) => {
        if (rows.some((r) => r.isIntersecting)) {
          setHintArmed(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [showHint]);

  useEffect(() => {
    if (!hintArmed) return;
    const t = setTimeout(() => setShowHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [hintArmed]);

  // Slow idle turn: one card every AUTO_MS while nobody is busy with it.
  // A heartbeat watches for the customer (drag, hover, keys, nav buttons)
  // and simply holds the countdown still until they let go.
  useEffect(() => {
    if (n < 2 || still()) return;
    const busy = () =>
      engagedRef.current ||
      hoveringRef.current ||
      Boolean(dragRef.current) ||
      document.visibilityState !== 'visible';
    let next = Date.now() + AUTO_START_MS;
    const beat = setInterval(() => {
      if (busy()) {
        next = Math.max(next, Date.now() + AUTO_MS);
        return;
      }
      if (animRef.current || Date.now() < next) return;
      next += AUTO_MS;
      spinTo(wrap(activeRef.current + 1));
    }, 250);
    return () => clearInterval(beat);
  }, [n, spinTo, wrap]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    engagedRef.current = true;
    setShowHint(false);
    stopAnim();
    if (snapRef.current) clearTimeout(snapRef.current);
    movedRef.current = false;
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX,
      pos0: posRef.current,
      lastT: e.timeStamp,
      v: 0,
      moved: false,
      captured: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const unit = cardWidth() * (1 - SWIPE_K);
    const dx = e.clientX - d.x0;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      movedRef.current = true;
      // Only capture once it is genuinely a drag. Capturing a tap would
      // retarget the click to the stage and the card would never open.
      d.captured = true;
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        d.captured = false;
      }
    }
    const pos = d.pos0 - dx / unit;
    const dt = (e.timeStamp - d.lastT) / 1000;
    if (dt > 0.008) {
      // Smooth over the last sample so one jittery frame can't fling it.
      const inst = (pos - posRef.current) / dt;
      d.v = d.v * 0.4 + inst * 0.6;
      d.lastT = e.timeStamp;
    }
    posRef.current = pos;
    setRot(pos);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (d.captured) {
      try {
        stageRef.current?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* the pointer is already gone */
      }
    }
    if (!d.moved) return;
    const fling = clamp(-FLING_STEPS, d.v * 0.22, FLING_STEPS);
    spinTo(wrap(Math.round(posRef.current + fling)), d.v);
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (n < 2) return;
    // Only a sideways gesture belongs to the barrel; a vertical wheel must
    // keep scrolling the page underneath it.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    engagedRef.current = true;
    const pos = clamp(
      Math.round(posRef.current) - WHEEL_LIMIT,
      posRef.current + e.deltaX / (cardWidth() * (1 - SWIPE_K)),
      Math.round(posRef.current) + WHEEL_LIMIT,
    );
    posRef.current = pos;
    setRot(pos);
    if (snapRef.current) clearTimeout(snapRef.current);
    snapRef.current = setTimeout(() => spinTo(wrap(Math.round(pos))), SNAP_DELAY);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) engagedRef.current = true;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      spinTo(wrap(active + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      spinTo(wrap(active - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      spinTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      spinTo(n - 1);
    }
  };

  /** Tap a side card to bring it round; tap the facing card to open it. */
  const onCard = (i: number) => {
    if (movedRef.current) return;
    if (i !== activeRef.current) {
      spinTo(i);
      return;
    }
    onOpen(entries[i].item.id);
  };

  /**
   * Tabbing (or arrowing) focus onto a card turns the barrel to it. A mouse
   * click must not do this: focus fires before click, so spinning on click
   * focus would make the same click look like a second tap and open the
   * dialog straight away.
   */
  const onCardFocus = (i: number, e: FocusEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.matches(':focus-visible')) return;
    if (i !== activeRef.current) spinTo(i);
  };

  const hint =
    'The barrel turns on its own — drag or swipe to take the wheel, then tap the card facing you for what’s in it.';

  return (
    <div
      className="bc-barrel"
      role="group"
      aria-label={`${label} — barrel gallery`}
      onFocus={() => {
        engagedRef.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) engagedRef.current = false;
      }}
    >
      <div
        ref={stageRef}
        className="bc-barrel-stage"
        style={{ '--n': n } as CSSProperties}
        onPointerEnter={() => {
          hoveringRef.current = true;
        }}
        onPointerLeave={() => {
          hoveringRef.current = false;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div aria-hidden className="bc-barrel-glow" />
        {showHint && (
          <div className="bc-swipe-hint" data-live={hintArmed ? 'true' : 'false'} aria-hidden>
            <span className="bc-swipe-arrow bc-swipe-arrow-l">‹</span>
            <span className="bc-swipe-label">Swipe to browse</span>
            <span className="bc-swipe-arrow bc-swipe-arrow-r">›</span>
          </div>
        )}
        <ul ref={ringRef} className="bc-barrel-ring">
          {entries.map(({ item, groupTitle }, i) => {
            const facing = i === active;
            return (
              <li
                key={item.id}
                ref={i === 0 ? slotRef : null}
                className="bc-barrel-slot"
                style={{ '--a': `${(i * step).toFixed(3)}deg` } as CSSProperties}
              >
                <button
                  type="button"
                  className="bc-barrel-card"
                  data-active={facing ? 'true' : 'false'}
                  onClick={() => onCard(i)}
                  onFocus={(e) => onCardFocus(i, e)}
                  aria-label={`${item.name}, ${item.price}, ${groupTitle}. ${
                    facing ? 'Open for details' : 'Bring to the front'
                  }`}
                >
                  <span className="bc-barrel-img">
                    <Image
                      src={item.src}
                      alt=""
                      width={480}
                      height={480}
                      priority={i < 3}
                      loading={i < 3 ? undefined : 'lazy'}
                      sizes="(max-width: 639px) 72vw, 286px"
                      className="!h-full !w-full object-cover"
                    />
                  </span>
                  {isRecommended(item) ? <BarrelStar label={item.badge ?? 'House pick'} /> : null}
                  {cartQtyForItem(cart, item.id) ? (
                    <span className="bc-barrel-qty" aria-label={`${cartQtyForItem(cart, item.id)} on your tray`}>
                      {cartQtyForItem(cart, item.id)}
                    </span>
                  ) : null}
                  <span className="bc-barrel-cap">
                    <span className="bc-barrel-name">{item.name}</span>
                    <span className="bc-barrel-note">{item.note}</span>
                    <span className="bc-barrel-line">
                      <span className="bc-barrel-price">{item.price}</span>
                      {facing ? <span className="bc-barrel-cta">Open</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <span aria-hidden className="bc-barrel-curtain bc-barrel-curtain-l" />
        <span aria-hidden className="bc-barrel-curtain bc-barrel-curtain-r" />
      </div>

      <div className="bc-barrel-hud">
        <button
          type="button"
          className="bc-barrel-nav"
          onClick={() => spinTo(wrap(active - 1))}
          disabled={n < 2}
          aria-label={`Previous ${label} item`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M14.5 5.5 8 12l6.5 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <p className="bc-barrel-count" aria-live="polite">
          <span className="bc-barrel-count-now">{String(active + 1).padStart(2, '0')}</span>
          <span className="bc-barrel-count-sep">/</span>
          <span className="bc-barrel-count-all">{String(n).padStart(2, '0')}</span>
          <span className="bc-barrel-count-name">{entries[active]?.item.name}</span>
        </p>
        <button
          type="button"
          className="bc-barrel-nav"
          onClick={() => spinTo(wrap(active + 1))}
          disabled={n < 2}
          aria-label={`Next ${label} item`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M9.5 5.5 16 12l-6.5 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <ul className="bc-barrel-dots" aria-label={`${label} items, jump to one`}>
        {entries.map(({ item }, i) => (
          <li key={item.id}>
            <button
              type="button"
              className="bc-barrel-dot"
              aria-current={i === active ? 'true' : undefined}
              aria-label={item.name}
              onClick={() => spinTo(i)}
            />
          </li>
        ))}
      </ul>

      <p className="bc-barrel-hint">{hint}</p>
    </div>
  );
}
