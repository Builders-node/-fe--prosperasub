import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  CART_SERVICES, cartItemKey, lineTotalCents, migrateStoredItem, type CartItem,
} from "@/lib/cart/cartItem";

const STORAGE_KEY = "prospera_cart";

export type { CartItem } from "@/lib/cart/cartItem";

interface CartContextValue {
  items: CartItem[];
  /** Lines, not units — "3 in your cart" should not mean one plan bought thrice. */
  count: number;
  totalCents: number;
  addItem: (item: Omit<CartItem, "key" | "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  /** Weeks for food, months for everything else — see CART_SERVICES. */
  setPeriods: (key: string, periods: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  /** Is this exact plan already in the cart? Used to say "In your cart". */
  has: (planId: string) => boolean;
}

const CartContext = createContext<CartContextValue>({
  items: [], count: 0, totalCents: 0,
  addItem: () => {}, setQty: () => {}, setPeriods: () => {}, removeItem: () => {}, clear: () => {},
  has: () => false,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map(migrateStoredItem).filter((i): i is CartItem => !!i)
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        setItems(Array.isArray(parsed)
          ? parsed.map(migrateStoredItem).filter((i): i is CartItem => !!i)
          : []);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem: CartContextValue["addItem"] = (item, qty = 1) => {
    const key = cartItemKey(item);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (!existing) return [...prev, { ...item, key, qty }];
      // A service where quantity means nothing — a second cleaning subscription
      // to the same plan would need a second schedule nobody asked for — stays
      // at one rather than silently stacking.
      if (!CART_SERVICES[item.service].allowsQuantity) return prev;
      return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
    });
  };

  const setQty: CartContextValue["setQty"] = (key, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, qty } : i)),
    );
  };

  const setPeriods: CartContextValue["setPeriods"] = (key, periods) => {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (!item || item.periods === periods) return prev;
      const newKey = cartItemKey({ ...item, periods });
      const existing = prev.find((i) => i.key === newKey);
      if (existing) {
        // Merge into the line that already has this plan for this long.
        return prev
          .filter((i) => i.key !== key)
          .map((i) => (i.key === newKey ? { ...i, qty: i.qty + item.qty } : i));
      }
      return prev.map((i) => (i.key === key ? { ...i, periods, key: newKey } : i));
    });
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);
  const has = (planId: string) => items.some((i) => i.planId === planId);

  const count = items.length;
  const totalCents = items.reduce((s, i) => s + lineTotalCents(i), 0);

  return (
    <CartContext.Provider
      value={{ items, count, totalCents, addItem, setQty, setPeriods, removeItem, clear, has }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

export const cartLineTotal = lineTotalCents;
