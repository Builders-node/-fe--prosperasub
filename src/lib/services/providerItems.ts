import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * What a provider delivers within a day, as the provider named it.
 *
 * "Breakfast, lunch, dinner" was written into the app in three label maps, a
 * TS union and a picker's key list, so a restaurant selling brunch could not be
 * described and a kitchen that says "almuerzo" read English on its own
 * manifest. The names live in `provider_items` now; this reads them.
 *
 * `service_occurrences.item_key` is unchanged and stays free text — it already
 * carries "Tennis Court 1" for the beach club. A key with no row simply shows
 * itself, tidied, which is what every non-food service has always done.
 */

export interface ProviderItem {
  key: string;
  label: string;
  sortOrder: number;
  /** Minutes from midnight, or null when it has no usual time. */
  defaultMinutes: number | null;
}

export const PROVIDER_ITEMS_KEY = (providerId: string | null | undefined) =>
  ["provider-items", providerId ?? ""] as const;

export async function fetchProviderItems(providerId: string): Promise<ProviderItem[]> {
  const { data, error } = await supabaseDb
    .from("provider_items")
    .select("key, label, sort_order, default_minutes")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    key: String(r.key),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
    defaultMinutes: r.default_minutes == null ? null : Number(r.default_minutes),
  }));
}

export function useProviderItems(providerId: string | null | undefined) {
  const query = useQuery({
    queryKey: PROVIDER_ITEMS_KEY(providerId),
    enabled: !!providerId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchProviderItems(providerId!),
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

/**
 * A key as a person should read it.
 *
 * The provider's own label wins. Failing that the key is tidied rather than
 * printed raw — `late_dinner` reads "Late dinner" — and a key that is already a
 * name ("Tennis Court 1") survives untouched.
 */
export function itemLabel(key: string | null | undefined, items: ProviderItem[] = []): string {
  if (!key) return "";
  const named = items.find((i) => i.key === key);
  if (named) return named.label;
  if (/[A-Z\s]/.test(key)) return key;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Sort by the provider's order, then alphabetically for anything unlisted —
 * a courier runs every breakfast together, whatever breakfast is called here.
 */
export function itemRank(key: string | null | undefined, items: ProviderItem[] = []): number {
  const i = items.findIndex((x) => x.key === key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : items[i].sortOrder;
}
