import { useSyncExternalStore } from "react";

/**
 * Plans this browser opened lately, newest first — the home page's "Recently
 * viewed" shelf.
 *
 * Kept in this browser only: it is a convenience, not a record, and nobody
 * else needs to know what someone looked at. The id is whichever one the plan
 * page was opened with (universal or legacy); the home page resolves both.
 */

const KEY = "prospera_recently_viewed";
const MAX = 12;

const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordPlanView(id: string) {
  if (!id) return;
  const next = [id, ...read().filter((x) => x !== id)].slice(0, MAX);
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: memory only */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

const EMPTY: string[] = [];
export function useRecentlyViewed(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
