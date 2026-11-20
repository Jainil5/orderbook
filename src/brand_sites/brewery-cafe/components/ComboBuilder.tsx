'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import { animate } from 'motion/react';
import { type MenuGroup, type MenuItem } from './menu';
import {
  initialSelection,
  money,
  unitPriceOf,
  variantKey,
  type CartAction,
  type Tray,
} from './cart';

const still = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface MiniBarrelProps {
  label: string;
  items: MenuItem[];
  selected: number;
  onSelect: (i: number) => void;
}

function MiniBarrel({ label, items, selected, onSelect }: MiniBarrelProps) {
  const n = items.length;
  const step = 360 / n;
  const ringRef = useRef<HTMLUListElement>(null);
  const posRef = useRef(selected);
  const animRef = useRef<{ stop: () => void } | null>(null);

  const setRot = useCallback(
    (pos: number) => ringRef.current?.style.setProperty('--rot', `${(-pos * step).toFixed(3)}deg`),
    [step],
  );

  const spinTo = useCallback(
    (i: number) => {
      const base = Math.round(posRef.current);
      let delta = i - (((base % n) + n) % n);
      if (delta > n / 2) delta -= n;
      if (delta < -n / 2) delta += n;
      const target = base + delta;
      animRef.current?.stop();
      if (still()) {
        posRef.current = target;
        setRot(target);
        onSelect(i);
        return;
      }
      animRef.current = animate(posRef.current, target, {
        type: 'spring',
        stiffness: 180,
        damping: 24,
        onUpdate: (v) => { posRef.current = v; setRot(v); },
        onComplete: () => onSelect(i),
      });
    },
    [n, setRot, onSelect],
  );

  useEffect(() => { setRot(posRef.current); }, [setRot]);

  useEffect(() => {
    if (n < 2 || still()) return;
    let next = Date.now() + 1200;
    const beat = setInterval(() => {
      if (animRef.current || document.visibilityState !== 'visible') { next = Math.max(next, Date.now() + 4000); return; }
      if (Date.now() < next) return;
      next += 4000;
      const cur = ((Math.round(posRef.current) % n) + n) % n;
      spinTo((cur + 1) % n);
    }, 250);
    return () => clearInterval(beat);
  }, [n, spinTo]);

  return (
    <div className="bc-combo-wheel" role="listbox" aria-label={label}>
      <p className="bc-display bc-combo-wheel-label">{label}</p>
      <div className="bc-combo-stage" style={{ '--n': n } as CSSProperties}>
        <ul ref={ringRef} className="bc-barrel-ring bc-combo-ring">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="bc-barrel-slot bc-combo-slot"
              style={{ '--a': `${(i * step).toFixed(3)}deg` } as CSSProperties}
            >
              <button
                type="button"
                role="option"
                aria-selected={i === selected}
                className="bc-barrel-card bc-combo-card"
                data-active={i === selected ? 'true' : 'false'}
                onClick={() => spinTo(i)}
              >
                <span className="bc-barrel-img">
                  <Image src={item.src} alt="" width={280} height={280} sizes="140px" className="!h-full !w-full object-cover" />
                </span>
                <span className="bc-barrel-cap">
                  <span className="bc-barrel-name">{item.name}</span>
                  <span className="bc-barrel-price">{item.price}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ComboBuilderProps {
  tray: Tray;
  dispatch: (action: CartAction) => void;
  /** The two board sections the wheels are cut from. */
  left: MenuGroup;
  right: MenuGroup;
}

/**
 * A pair, not a promotion: the wheels put two real catalog lines on the tray at
 * the counter's own prices, with each one's default modifiers already picked.
 * There is no invented combo discount, so the bill can never disagree.
 */
export function ComboBuilder({ tray, dispatch, left, right }: ComboBuilderProps) {
  const [leftIdx, setLeftIdx] = useState(0);
  const [rightIdx, setRightIdx] = useState(0);

  // An item the counter takes off the board mid-spin must not stay on a wheel.
  const leftItems = useMemo(() => left.items.filter((item) => item.available), [left]);
  const rightItems = useMemo(() => right.items.filter((item) => item.available), [right]);
  const first = leftItems[Math.min(leftIdx, leftItems.length - 1)];
  const second = rightItems[Math.min(rightIdx, rightItems.length - 1)];

  if (!first || !second) {
    return (
      <p className="bc-combo-empty">
        The combo wheels need two sections on the board. Order from the list instead — everything
        else here is live.
      </p>
    );
  }

  const leftPicks = initialSelection(first);
  const rightPicks = initialSelection(second);
  const leftKey = variantKey(first.id, leftPicks);
  const rightKey = variantKey(second.id, rightPicks);
  const comboPrice = unitPriceOf(first, leftPicks) + unitPriceOf(second, rightPicks);

  const addCombo = () => {
    dispatch({ type: 'add', id: leftKey });
    dispatch({ type: 'add', id: rightKey });
  };

  return (
    <div className="bc-combo" aria-label="Build your combo">
      <div className="bc-combo-header">
        <h3 className="bc-display text-2xl text-[var(--bc-paper)]">Pick your perfect pair</h3>
        <p className="text-sm text-[rgba(251,244,233,0.72)]">
          Spin each wheel to settle on one from {left.title.toLowerCase()} and one from{' '}
          {right.title.toLowerCase()}, then put the pair on your tray in one go.
        </p>
      </div>

      <div className="bc-combo-wheels">
        <MiniBarrel label={left.title} items={leftItems} selected={leftIdx} onSelect={setLeftIdx} />
        <span className="bc-combo-plus" aria-hidden>+</span>
        <MiniBarrel label={right.title} items={rightItems} selected={rightIdx} onSelect={setRightIdx} />
      </div>

      <div className="bc-combo-summary">
        <div className="bc-combo-pair">
          <span>{first.name}</span>
          <span className="bc-combo-sep" aria-hidden>+</span>
          <span>{second.name}</span>
        </div>
        <div className="bc-combo-price">
          <span className="bc-display bc-combo-now">{money(tray, comboPrice)}</span>
        </div>
        <button type="button" className="bc-btn bc-btn-solid bc-combo-add" onClick={addCombo}>
          Add combo to order
        </button>
      </div>
    </div>
  );
}
