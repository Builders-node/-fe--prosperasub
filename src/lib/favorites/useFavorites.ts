import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { accountApi } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics/ga";

/**
 * Favourites — the logic in one place.
 *
 *  - Signed in: the list lives on the account (Edge /account/favorites), so it
 *    is the same on a phone and a laptop.
 *  - A guest can save too — nobody should have to make an account to remember
 *    a plan they liked. Those hearts sit in this browser and move onto the
 *    account the moment they sign in (`FavoritesSync`), then the local copy is
 *    cleared.
 *  - A plan can be known by two ids (legacy + universal). The server stores
 *    the universal one and hands the alias back, so the heart on a card that
 *    holds the legacy id still shows as saved.
 *  - The heart flips immediately; the server catches up. A failure flips it
 *    back and says so.
 */

export type FavoriteKind = "plan" | "provider" | "vehicle";
export interface FavoriteItem { kind: FavoriteKind; id: string; aliases?: string[]; savedAt: string }

const LOCAL_KEY = "prospera_favorites";
const QUERY_KEY = ["favorites"] as const;
const key = (kind: string, id: string) => `${kind}:${id}`;

// ── Guest store (this browser) ───────────────────────────────────────────────
const listeners = new Set<() => void>();
let localCache: FavoriteItem[] | null = null;

function readLocal(): FavoriteItem[] {
  if (localCache) return localCache;
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    localCache = Array.isArray(raw) ? raw.filter((x) => x && x.kind && x.id) : [];
  } catch {
    localCache = [];
  }
  return localCache;
}
function writeLocal(items: FavoriteItem[]) {
  localCache = items;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch { /* private mode: keep in memory */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === LOCAL_KEY) { localCache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
};

// ── The hook ──────────────────────────────────────────────────────────────────
export function useFavorites() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const local = useSyncExternalStore(subscribe, readLocal, () => []);

  const remote = useQuery({
    queryKey: QUERY_KEY,
    enabled: isAuthenticated,
    staleTime: 60_000,
    queryFn: async (): Promise<FavoriteItem[]> => {
      const { data, error } = await accountApi("/account/favorites");
      if (error) throw error;
      return ((data as { items?: FavoriteItem[] })?.items ?? []);
    },
  });

  const items: FavoriteItem[] = isAuthenticated ? (remote.data ?? []) : local;

  const savedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const f of items) {
      s.add(key(f.kind, f.id));
      for (const a of f.aliases ?? []) s.add(key(f.kind, a));
    }
    return s;
  }, [items]);

  const isSaved = useCallback((kind: FavoriteKind, id?: string | null) => !!id && savedKeys.has(key(kind, id)), [savedKeys]);

  const mutate = useMutation({
    mutationFn: async ({ kind, id, save }: { kind: FavoriteKind; id: string; save: boolean }) => {
      const { error } = save
        ? await accountApi("/account/favorites", { method: "POST", body: JSON.stringify({ kind, id }) })
        : await accountApi(`/account/favorites/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (error) throw error;
    },
    onMutate: async ({ kind, id, save }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<FavoriteItem[]>(QUERY_KEY);
      qc.setQueryData<FavoriteItem[]>(QUERY_KEY, (cur = []) => save
        ? [{ kind, id, savedAt: new Date().toISOString() }, ...cur]
        : cur.filter((f) => !(f.kind === kind && (f.id === id || f.aliases?.includes(id)))));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
      toast.error(e.message || "Couldn't update your favourites.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const setSaved = useCallback((kind: FavoriteKind, id: string, save: boolean) => {
    if (isAuthenticated) {
      mutate.mutate({ kind, id, save });
    } else {
      const cur = readLocal();
      writeLocal(save
        ? [{ kind, id, savedAt: new Date().toISOString() }, ...cur.filter((f) => !(f.kind === kind && f.id === id))]
        : cur.filter((f) => !(f.kind === kind && f.id === id)));
    }
  }, [isAuthenticated, mutate]);

  /** Flip the heart, and say what happened — with the way back. */
  const toggle = useCallback((kind: FavoriteKind, id: string, opts: { name?: string; onView?: () => void } = {}) => {
    const save = !isSaved(kind, id);
    setSaved(kind, id, save);
    if (save) {
      trackEvent("add_to_wishlist", { items: [{ item_id: id, item_name: opts.name, item_category: kind }] });
      toast.success("Saved to favourites", opts.onView ? { action: { label: "View", onClick: opts.onView } } : undefined);
    } else {
      toast("Removed from favourites", { action: { label: "Undo", onClick: () => setSaved(kind, id, true) } });
    }
  }, [isSaved, setSaved]);

  return { items, isSaved, toggle, setSaved, count: items.length, isLoading: isAuthenticated && remote.isLoading };
}

/**
 * Mounted once: when a guest with hearts in this browser signs in, move them
 * onto the account, then forget the local copy.
 */
export function FavoritesSync() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const running = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || running.current) return;
    const pending = readLocal();
    if (!pending.length) return;
    running.current = true;
    void (async () => {
      const { error } = await accountApi("/account/favorites/merge", {
        method: "POST",
        body: JSON.stringify({ items: pending.map(({ kind, id }) => ({ kind, id })) }),
      });
      if (!error) {
        writeLocal([]);
        qc.invalidateQueries({ queryKey: QUERY_KEY });
      }
      running.current = false;
    })();
  }, [isAuthenticated, qc]);
  return null;
}
