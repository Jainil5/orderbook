import { useMemo, useSyncExternalStore } from "react";
import { formatMoney } from "@/lib/format";
import { computeCartTotals, effectiveUnitPrice, type CartTotals } from "@/lib/pricing/discounts";
import { modifierPriceDelta, defaultModifierSelection, parseProductModifiers } from "@/lib/products/modifiers";
import type { Product } from "@/types/database";
import type { MenuGroup, MenuItem } from "./menu";

export const CART_KEY = "bc-cart-v1";
export const MAX_QTY = 20;

/**
 * Cart key: the Orderbook product id, plus the modifier option ids picked for
 * it. Picking nothing at all is meaningful too — Billing then applies the
 * group's default, so the key stays bare and the price matches the counter.
 */
export function variantKey(productId: string, optionIds: readonly string[] = []): string {
  const picks = [...optionIds].sort();
  return picks.length ? `${productId}:${picks.join("+")}` : productId;
}

export function parseVariantKey(key: string): { productId: string; optionIds: string[] } {
  const [productId, rest] = key.split(":");
  return { productId, optionIds: rest ? rest.split("+") : [] };
}

/** The catalog the tray prices against, resolved once from the page's menu. */
export type Tray = {
  byProductId: Map<string, MenuItem>;
  currencyCode: string;
};

export function trayFrom(groups: MenuGroup[], currencyCode: string): Tray {
  return {
    byProductId: new Map(groups.flatMap((g) => g.items).map((item) => [item.id, item] as const)),
    currencyCode,
  };
}

export const money = (tray: Tray, amount: number): string => formatMoney(amount, tray.currencyCode);

/**
 * The product row as Billing will hold it once this line is on a bill: list
 * price plus the picked modifiers, before the product's own default discount.
 */
export function pricedProduct(item: MenuItem, optionIds: readonly string[]): Product {
  const delta = modifierPriceDelta(item.product, [...optionIds]);
  return { ...item.product, price: Math.max(0, item.product.price + delta) };
}

export function unitPriceOf(item: MenuItem, optionIds: readonly string[]): number {
  return effectiveUnitPrice(pricedProduct(item, optionIds));
}

/** The picks a line starts with, so the dialog can preselect like the POS does. */
export const initialSelection = (item: MenuItem): string[] =>
  defaultModifierSelection(parseProductModifiers(item.product));

/** itemId -> quantity */
export type CartState = Record<string, number>;

export type CartAction =
  | { type: "add"; id: string }
  | { type: "setQty"; id: string; qty: number }
  | { type: "replace"; state: CartState }
  | { type: "clear" };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const qty = (state[action.id] ?? 0) + 1;
      return { ...state, [action.id]: Math.min(qty, MAX_QTY) };
    }
    case "setQty": {
      if (action.qty <= 0) {
        const rest = { ...state };
        delete rest[action.id];
        return rest;
      }
      return { ...state, [action.id]: Math.min(action.qty, MAX_QTY) };
    }
    case "replace":
      return action.state;
    case "clear":
      return {};
  }
}

export type TrayLine = {
  key: string;
  item: MenuItem;
  optionIds: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

/** Lines in menu order, each resolved back to its catalog row. */
export function lineItems(state: CartState, tray: Tray): TrayLine[] {
  const lines: TrayLine[] = [];
  for (const [productId, item] of tray.byProductId) {
    for (const [key, qty] of Object.entries(state)) {
      if (!qty || parseVariantKey(key).productId !== productId) continue;
      const { optionIds } = parseVariantKey(key);
      const unitPrice = unitPriceOf(item, optionIds);
      lines.push({ key, item, optionIds, qty, unitPrice, lineTotal: unitPrice * qty });
    }
  }
  return lines;
}

export const cartCount = (state: CartState): number =>
  Object.values(state).reduce((n, qty) => n + qty, 0);

/** Total qty across every variant of one product. */
export function cartQtyForItem(state: CartState, productId: string): number {
  let total = 0;
  for (const [key, qty] of Object.entries(state)) {
    if (parseVariantKey(key).productId === productId) total += qty;
  }
  return total;
}

/**
 * Subtotal, discounts and GST for the tray, through the same totals function
 * the order builder runs — this is the number the saved order will carry.
 */
export function trayTotals(state: CartState, tray: Tray, taxRatePercent: number): CartTotals {
  return computeCartTotals({
    lines: lineItems(state, tray).map((line) => ({
      product: pricedProduct(line.item, line.optionIds),
      quantity: line.qty,
    })),
    taxRatePercent,
    orderDiscount: null,
  });
}

export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Stored carts are untrusted: a row the catalog dropped can never come back. */
export function loadCart(store: KvStore, tray: Tray): CartState {
  try {
    const raw = store.getItem(CART_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const state: CartState = {};
    for (const [key, qty] of Object.entries(parsed)) {
      const { productId } = parseVariantKey(key);
      if (tray.byProductId.has(productId) && Number.isInteger(qty) && (qty as number) > 0) {
        state[key] = Math.min(qty as number, MAX_QTY);
      }
    }
    return state;
  } catch {
    return {};
  }
}

export function saveCart(store: KvStore, state: CartState): void {
  if (Object.keys(state).length === 0) store.removeItem(CART_KEY);
  else store.setItem(CART_KEY, JSON.stringify(state));
}

const NO_STORE: KvStore = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const EMPTY_CART: CartState = {};
const SERVER_CART = () => EMPTY_CART;

/**
 * A tray that lives in sessionStorage, shaped for `useSyncExternalStore`: the
 * server always sees an empty tray, the tab sees what it left there, and React
 * reconciles the two after hydration instead of the page guessing.
 */
export function createCartStore(storage: KvStore | undefined, tray: Tray) {
  const store = storage ?? NO_STORE;
  let current = loadCart(store, tray);
  const listeners = new Set<() => void>();
  return {
    subscribe(onFresh: () => void) {
      listeners.add(onFresh);
      return () => {
        listeners.delete(onFresh);
      };
    },
    getSnapshot: () => current,
    getServerSnapshot: SERVER_CART,
    dispatch(action: CartAction) {
      const next = cartReducer(current, action);
      if (next === current) return;
      current = next;
      saveCart(store, next);
      for (const listen of listeners) listen();
    },
  };
}

export function useCart(tray: Tray): [CartState, (action: CartAction) => void] {
  const store = useMemo(
    () => createCartStore(typeof window === "undefined" ? undefined : window.sessionStorage, tray),
    [tray],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [state, store.dispatch];
}
