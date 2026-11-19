"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { SiteMenuItem } from "@/lib/site/menu";

export type CartLine = {
  productId: string;
  quantity: number;
  /** Picked modifier option ids, in group order. */
  modifierIds: string[];
};

type CartState = { lines: CartLine[] };

type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "setQty"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "hydrate"; lines: CartLine[] };

/** A line's identity is its product plus its exact modifier picks. */
export function cartLineKey(line: Pick<CartLine, "productId" | "modifierIds">) {
  return `${line.productId}::${[...line.modifierIds].sort().join("+")}`;
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { lines: action.lines };
    case "add": {
      const key = cartLineKey(action.line);
      const existing = state.lines.find((l) => cartLineKey(l) === key);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            cartLineKey(l) === key
              ? { ...l, quantity: Math.min(20, l.quantity + action.line.quantity) }
              : l,
          ),
        };
      }
      return { lines: [...state.lines, action.line].slice(-20) };
    }
    case "setQty": {
      const quantity = Math.max(0, Math.min(20, action.quantity));
      if (quantity === 0) {
        return { lines: state.lines.filter((l) => cartLineKey(l) !== action.key) };
      }
      return {
        lines: state.lines.map((l) =>
          cartLineKey(l) === action.key ? { ...l, quantity } : l,
        ),
      };
    }
    case "remove":
      return { lines: state.lines.filter((l) => cartLineKey(l) !== action.key) };
    case "clear":
      return { lines: [] };
  }
}

export type CartTotals = {
  itemCount: number;
  subtotal: number;
};

type CartApi = CartTotals & {
  lines: CartLine[];
  add: (line: CartLine) => void;
  setQty: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Line price including its modifier deltas, at the item's effective price. */
  lineUnitPrice: (line: CartLine) => number;
  lineTotal: (line: CartLine) => number;
};

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({
  items,
  brandCode,
  children,
}: {
  items: SiteMenuItem[];
  brandCode: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, { lines: [] });
  // Hydration marker lives in a ref: the persistence effect must not run on
  // the pre-hydration render or it would overwrite the stored cart with [].
  const hydrated = useRef(false);
  const storageKey = `ob_site_cart_${brandCode}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          dispatch({
            type: "hydrate",
            lines: parsed
              .filter(
                (line): line is CartLine =>
                  typeof line === "object" &&
                  line !== null &&
                  typeof (line as CartLine).productId === "string" &&
                  Array.isArray((line as CartLine).modifierIds),
              )
              .map((line) => ({
                productId: line.productId,
                quantity: Math.max(1, Math.min(20, Number(line.quantity) || 1)),
                modifierIds: line.modifierIds.map(String),
              })),
          });
        }
      }
    } catch {
      // A corrupted cart is not worth a crash — start empty.
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state.lines));
    } catch {
      // Storage full or blocked: the cart just does not survive reloads.
    }
  }, [state.lines, storageKey]);

  const api = useMemo<CartApi>(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    // Site items already carry the parsed modifier groups, so the delta is a
    // plain sum over the picked options — same arithmetic as the counter POS.
    const unitPrice = (line: CartLine): number => {
      const item = byId.get(line.productId);
      if (!item) return 0;
      let delta = 0;
      for (const group of item.modifiers) {
        for (const option of group.options) {
          if (line.modifierIds.includes(option.id)) delta += option.price;
        }
      }
      return Math.max(0, Math.round((item.price + delta) * 100) / 100);
    };
    const totals = state.lines.reduce<CartTotals>(
      (sum, line) => {
        const quantity = line.quantity;
        const item = byId.get(line.productId);
        return {
          itemCount: sum.itemCount + quantity,
          subtotal: sum.subtotal + (item ? unitPrice(line) * quantity : 0),
        };
      },
      { itemCount: 0, subtotal: 0 },
    );
    return {
      lines: state.lines,
      itemCount: totals.itemCount,
      subtotal: Math.round(totals.subtotal * 100) / 100,
      add: (line) => dispatch({ type: "add", line }),
      setQty: (key, quantity) => dispatch({ type: "setQty", key, quantity }),
      remove: (key) => dispatch({ type: "remove", key }),
      clear: () => dispatch({ type: "clear" }),
      lineUnitPrice: unitPrice,
      lineTotal: (line) => Math.round(unitPrice(line) * line.quantity * 100) / 100,
    };
  }, [items, state.lines]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside CartProvider");
  return cart;
}
