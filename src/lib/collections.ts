import { useQuery } from "@tanstack/react-query";
import { trData } from "@/lib/tr";
import { supabaseDb } from "@/integrations/supabase/client";
import type { HomePlan } from "@/components/discovery/homePlans";

/**
 * Collections — what an admin puts together (Admin → Marketing → Collections):
 * "Popular", "Date night", "For families". Each one is two things at once:
 *
 *   - a shelf on the home page (title, one line, the first eight cards), and
 *   - its own page, /collections/<slug> — a cover, a few sentences and every
 *     offer on it. /collections lists them all.
 *
 * Read straight from the tables (public RLS on active rows). The page columns
 * (slug, cover_url, description) come with the collection_pages migration;
 * before it, collections still read and link by id.
 */

export interface Collection {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverUrl: string | null;
  slug: string | null;
  tagKey: string | null;
  planIds: string[];
}

type Row = {
  id: string; title: string; subtitle: string | null; tag_key?: string | null;
  slug?: string | null; cover_url?: string | null; description?: string | null;
  home_collection_plans: Array<{ plan_id: string; sort_order: number }> | null;
};

async function readCollections(): Promise<Collection[]> {
  const read = (cols: string) => supabaseDb
    .from("home_collections")
    .select(`${cols}, home_collection_plans(plan_id, sort_order)`)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  // Newest schema first, then without the page columns, then without tag_key.
  let { data, error } = await read("id, title, subtitle, sort_order, tag_key, slug, cover_url, description");
  if (error && /slug|cover_url|description/i.test(error.message)) ({ data, error } = await read("id, title, subtitle, sort_order, tag_key"));
  if (error && /tag_key/i.test(error.message)) ({ data, error } = await read("id, title, subtitle, sort_order"));
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: trData(r.title),
    subtitle: r.subtitle,
    description: r.description ?? null,
    coverUrl: r.cover_url ?? null,
    slug: r.slug ?? null,
    tagKey: r.tag_key ?? null,
    planIds: [...(r.home_collection_plans ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => String(p.plan_id)),
  }));
}

/** Every collection that is on the site, in the admin's order. */
export function useCollections() {
  return useQuery({
    queryKey: ["home-collections"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: readCollections,
  });
}

/** `/collections/date-night` — or by id while a collection has no words yet. */
export function collectionHref(c: Pick<Collection, "id" | "slug">): string {
  return `/collections/${c.slug || c.id}`;
}

/**
 * What a collection shows, in order: the hand-picked offers first, then — for
 * one tied to a tag — every other live offer carrying it. Resolved against the
 * live list, so an offer that stopped selling simply drops off.
 */
export function collectionPlans(c: Collection, plans: HomePlan[], index: Map<string, HomePlan>): HomePlan[] {
  const picked = c.planIds.map((id) => index.get(id)).filter((p): p is HomePlan => !!p);
  const seen = new Set(picked.map((p) => p.id));
  const auto = c.tagKey
    ? plans.filter((p) => !seen.has(p.id) && Array.isArray(p.tags) && p.tags.includes(c.tagKey!))
    : [];
  return [...picked, ...auto];
}

/** "12 offers", "1 offer". */
export const offersLabel = (n: number) => `${n} ${n === 1 ? "offer" : "offers"}`;
