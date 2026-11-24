import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { businessHref, planHref, wordsAddress } from "@/lib/services/serviceUrls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Addresses in words for rows that arrive with ids only — a subscription's
 * plan_id, a promotion from the API.
 *
 * A link built from an id still opens (the page swaps it for the words), but
 * the visitor sees the id flash in the address bar and search engines see a
 * redirect. With this, the link carries the words from the start. Until the
 * lookup answers — or for an id it does not know — the link falls back to the
 * id, which still works.
 *
 * `planIds` may hold universal ids or a legacy plan's own id (source_plan_id).
 */
export function useAddresses({ providerIds = [], planIds = [] }: { providerIds?: Array<string | null | undefined>; planIds?: Array<string | null | undefined> }) {
  const provs = [...new Set(providerIds.filter((x): x is string => !!x && UUID.test(x)))].sort();
  const plans = [...new Set(planIds.filter((x): x is string => !!x))].sort();

  const q = useQuery({
    queryKey: ["addresses", provs, plans],
    enabled: provs.length > 0 || plans.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const business = new Map<string, string>();
      const plan = new Map<string, string>();
      if (provs.length) {
        const { data } = await supabaseDb.from("providers").select("id, slug").in("id", provs);
        for (const r of (data ?? []) as Array<{ id: string; slug: string | null }>) {
          if (r.slug) business.set(String(r.id), r.slug);
        }
      }
      if (plans.length) {
        const uuids = plans.filter((x) => UUID.test(x));
        const quoted = plans.map((x) => `"${x.replace(/"/g, "")}"`).join(",");
        const { data } = await supabaseDb
          .from("provider_plans")
          .select("id, slug, public_no, source_plan_id")
          .or(uuids.length ? `id.in.(${uuids.join(",")}),source_plan_id.in.(${quoted})` : `source_plan_id.in.(${quoted})`);
        for (const r of (data ?? []) as Array<{ id: string; slug: string | null; public_no: number | null; source_plan_id: string | null }>) {
          const words = wordsAddress(r);
          if (!words) continue;
          plan.set(String(r.id), words);
          if (r.source_plan_id) plan.set(String(r.source_plan_id), words);
        }
      }
      return { business, plan };
    },
  });

  return {
    /** /businesses/<slug> for a business id (its id until known). */
    businessHref: (id: string) => businessHref(q.data?.business.get(id) ?? id),
    /** /plans/<words>-<n> for any id of a plan (that id until known). */
    planHref: (id: string) => planHref(null, q.data?.plan.get(id) ?? id),
  };
}
