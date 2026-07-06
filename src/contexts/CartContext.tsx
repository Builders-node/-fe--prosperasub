import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const STORAGE_KEY = "prospera_cart";

export interface CartItem {
  /** Stable key = planId + duration, so identical lines stack as quantity. */
  key: string;
  providerId: string;
  providerName: string;
  planId: string;
  planName: string;
  unitPriceCents: number; // weekly price per portion
  durationWeeks: number;
  mealsPerDay: number;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  totalCents: number;
  addItem: (item: Omit<CartItem, "key" | "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  setDuration: (key: string, durationWeeks: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue>({
  items: [], count: 0, totalCents: 0,
  addItem: () => {}, setQty: () => {}, setDuration: () => {}, removeItem: () => {}, clear: () => {},
});

const lineTotal = (i: CartItem) => i.unitPriceCents * i.durationWeeks * i.qty;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
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
      if (e.key === STORAGE_KEY) {
        try { setItems(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem: CartContextValue["addItem"] = (item, qty = 1) => {
    const key = `${item.planId}_${item.durationWeeks}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, key, qty }];
    });
  };

  const setQty: CartContextValue["setQty"] = (key, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, qty } : i)),
    );
  };

  const setDuration: CartContextValue["setDuration"] = (key, durationWeeks) => {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (!item || item.durationWeeks === durationWeeks) return prev;
      const newKey = `${item.planId}_${durationWeeks}`;
      const existing = prev.find((i) => i.key === newKey);
      if (existing) {
        // Merge into the line that already has this plan + duration.
        return prev
          .filter((i) => i.key !== key)
          .map((i) => (i.key === newKey ? { ...i, qty: i.qty + item.qty } : i));
      }
      return prev.map((i) => (i.key === key ? { ...i, durationWeeks, key: newKey } : i));
    });
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const totalCents = items.reduce((s, i) => s + lineTotal(i), 0);

  return (
    <CartContext.Provider value={{ items, count, totalCents, addItem, setQty, setDuration, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

export const cartLineTotal = lineTotal;
