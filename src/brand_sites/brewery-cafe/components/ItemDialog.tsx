'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { parseProductModifiers, type ModifierGroup } from '@/lib/products/modifiers';
import { isRecommended, type MenuItem } from './menu';
import {
  MAX_QTY,
  initialSelection,
  money,
  unitPriceOf,
  variantKey,
  type CartAction,
  type Tray,
} from './cart';

interface ItemDialogProps {
  item: MenuItem;
  /** The category the tile was opened from, e.g. "Coffee". */
  groupTitle: string;
  tray: Tray;
  qty: number;
  dispatch: (action: CartAction) => void;
  onClose: () => void;
}

/**
 * One product, opened up. Every choice on this sheet is the same modifier group
 * the cashier is asked for, and the price is worked out by the same helper —
 * what the customer sees here is what the bill will carry.
 */
export function ItemDialog({ item, groupTitle, tray, qty, dispatch, onClose }: ItemDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups: ModifierGroup[] = useMemo(
    () => parseProductModifiers(item.product),
    [item.product],
  );
  const [picked, setPicked] = useState<string[]>(() => initialSelection(item));

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const key = variantKey(item.id, picked);
  const unitPrice = unitPriceOf(item, picked);

  const pick = (group: ModifierGroup, optionId: string) => {
    const inGroup = new Set(group.options.map((o) => o.id));
    setPicked((prev) => {
      const others = prev.filter((id) => !inGroup.has(id));
      // A single group always resolves to exactly one option, the way the
      // cashier cannot leave a required choice blank on a bill.
      if (group.type === 'single') return [...others, optionId];
      return prev.includes(optionId) ? others : [...others, optionId];
    });
  };

  return (
    <div className="bc-dialog-scrim" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name}, ${groupTitle}`}
        className="bc-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="bc-dialog-close"
          onClick={onClose}
          aria-label={`Close ${item.name}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="bc-dialog-img">
          <Image src={item.src} alt={item.name} width={720} height={540} priority className="!h-full !w-full object-cover" />
        </div>

        <div className="bc-dialog-body">
          <p className="bc-dialog-cat">{groupTitle}</p>
          <div className="bc-dialog-row">
            <h3 className="bc-dialog-name">{item.name}</h3>
            <span className="bc-dialog-price">{money(tray, unitPrice)}</span>
          </div>
          {isRecommended(item) && item.badge ? <p className="bc-dialog-reason">★ {item.badge}</p> : null}
          <p className="bc-dialog-note">{item.note}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="bc-pill">{item.available ? `One ${item.unit ?? 'order'}` : 'Off the board today'}</span>
            {item.unitsLeft != null ? (
              <span className="bc-pill">{item.unitsLeft} in the house</span>
            ) : null}
          </div>

          {groups.map((group) => (
            <fieldset key={group.id} className="bc-dialog-variants">
              <legend className="bc-dialog-label">{group.name}</legend>
              <div className="bc-variant-group">
                {group.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="bc-variant-btn"
                    data-active={picked.includes(option.id) ? 'true' : 'false'}
                    onClick={() => pick(group, option.id)}
                    aria-pressed={picked.includes(option.id)}
                  >
                    {option.name}
                    <span className="bc-variant-extra">
                      {option.price === 0
                        ? 'included'
                        : `${option.price > 0 ? '+' : '−'}${money(tray, Math.abs(option.price))}`}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}

          {item.inIt.length ? (
            <>
              <p className="bc-dialog-label">Made with</p>
              <p className="bc-dialog-text">{item.inIt.join(' · ')}</p>
            </>
          ) : null}

          {!item.available ? (
            <p className="bc-dialog-text">
              The counter has this one off today. Everything else on the board is live.
            </p>
          ) : qty > 0 ? (
            <div className="bc-dialog-actions">
              <div className="bc-tray-step" role="group" aria-label={`How many ${item.name}`}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'setQty', id: key, qty: qty - 1 })}
                  aria-label={`One fewer ${item.name}`}
                >
                  −
                </button>
                <span>{qty}</span>
                <button
                  type="button"
                  disabled={qty >= MAX_QTY}
                  onClick={() => dispatch({ type: 'setQty', id: key, qty: qty + 1 })}
                  aria-label={`One more ${item.name}`}
                >
                  +
                </button>
              </div>
              <span className="bc-dialog-line-total">{money(tray, unitPrice * qty)}</span>
              <button type="button" className="bc-dialog-done" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="bc-dialog-add"
              onClick={() => dispatch({ type: 'add', id: key })}
            >
              + Add to order — {money(tray, unitPrice)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
