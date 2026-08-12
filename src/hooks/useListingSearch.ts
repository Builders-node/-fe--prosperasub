import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Search and sort for a service listing.
 *
 * No listing had either. With four plans on a page you can read them all; the
 * cleaning listing already carries ten across two providers and the food one
 * six, and there is no way to answer "what's the cheapest" without scrolling
 * and comparing by eye.
 *
 * Both live in the URL, so a filtered listing can be shared, survives a
 * reload, and comes back intact on Back — the same reason the car listing
 * already keeps its dates there.
 */

export type SortKey = "recommended" | "price_asc" | "price_desc" | "rating" | "name";

export const SORT_LABELS: Record<SortKey, string> = {
  recommended: "Recommended",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Top rated",
  name: "Name (A–Z)",
};

export interface ListingSearchConfig<T> {
  /** Everything a search should look at — name, description, provider, tags. */
  text: (item: T) => Array<string | null | undefined>;
  /** In cents. null when the item has no price; those sort last either way. */
  price?: (item: T) => number | null | undefined;
  /** Average rating, if the item has one. */
  rating?: (item: T) => number | null | undefined;
  /** What the item is called, for the A–Z sort. */
  name?: (item: T) => string;
  /** Distinct per page, so two listings on one route don't fight over ?q=. */
  paramPrefix?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function useListingSearch<T>(items: T[], config: ListingSearchConfig<T>) {
  const [params, setParams] = useSearchParams();
  const prefix = config.paramPrefix ?? "";
  const qKey = `${prefix}q`;
  const sortKey = `${prefix}sort`;

  const query = params.get(qKey) ?? "";
  const rawSort = params.get(sortKey) as SortKey | null;
  const sort: SortKey = rawSort && rawSort in SORT_LABELS ? rawSort : "recommended";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // replace: typing a query should not bury the page under history entries.
    setParams(next, { replace: true });
  };

  const setQuery = (value: string) => setParam(qKey, value);
  const setSort = (value: SortKey) => setParam(sortKey, value === "recommended" ? "" : value);

  /** Offer "Top rated" only when something on the page actually has a rating. */
  const availableSorts = useMemo<SortKey[]>(() => {
    const keys: SortKey[] = ["recommended"];
    if (config.price) keys.push("price_asc", "price_desc");
    if (config.rating && items.some((i) => (config.rating!(i) ?? 0) > 0)) keys.push("rating");
    if (config.name) keys.push("name");
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const results = useMemo(() => {
    const needle = norm(query.trim());
    const terms = needle ? needle.split(/\s+/) : [];

    // Every term must appear somewhere in the item's text — "elias 3" finds
    // the three-meal plan at Elias without needing the words adjacent.
    const matched = terms.length
      ? items.filter((item) => {
          const haystack = norm(config.text(item).filter(Boolean).join(" "));
          return terms.every((t) => haystack.includes(t));
        })
      : items;

    if (sort === "recommended") return matched;

    const sorted = [...matched];
    const priceOf = (i: T) => config.price?.(i) ?? null;
    const ratingOf = (i: T) => config.rating?.(i) ?? null;

    // Items missing the sort key go to the end whichever direction we're
    // going — a plan with no price is not "the cheapest".
    const nullsLast = (a: number | null, b: number | null, cmp: (x: number, y: number) => number) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return cmp(a, b);
    };

    if (sort === "price_asc") sorted.sort((a, b) => nullsLast(priceOf(a), priceOf(b), (x, y) => x - y));
    else if (sort === "price_desc") sorted.sort((a, b) => nullsLast(priceOf(a), priceOf(b), (x, y) => y - x));
    else if (sort === "rating") sorted.sort((a, b) => nullsLast(ratingOf(a), ratingOf(b), (x, y) => y - x));
    else if (sort === "name" && config.name) {
      sorted.sort((a, b) => config.name!(a).localeCompare(config.name!(b)));
    }
    return sorted;
  }, [items, query, sort, config]);

  return {
    query,
    setQuery,
    sort,
    setSort,
    availableSorts,
    results,
    /** True when the page is showing a subset or a re-order, not the browse view. */
    isActive: query.trim().length > 0 || sort !== "recommended",
  };
}
