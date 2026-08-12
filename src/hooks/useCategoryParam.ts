import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_CATEGORIES } from "@/components/listing/ListingNav";

/**
 * The selected category chip, kept in the URL.
 *
 * It was local `useState` on all five listings, which meant a category could
 * be chosen but never linked to. That is fine while the only way to pick one
 * is the chip row on the page itself — and useless the moment anything wants
 * to send someone straight to "Car Wash" rather than to cleaning-in-general,
 * which is exactly what the home carousel does.
 *
 * Same shape as the search and sort state next to it (useListingSearch), so a
 * shared listing URL carries everything the visitor was looking at.
 */
export function useCategoryParam(): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get("category") || ALL_CATEGORIES;

  const setValue = useCallback((next: string) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      // "All" is the default, so it stays out of the URL rather than sitting
      // there as ?category=__all__.
      if (!next || next === ALL_CATEGORIES) out.delete("category");
      else out.set("category", next);
      return out;
    }, { replace: true });
  }, [setParams]);

  return [value, setValue];
}
