import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === "string" && v[0] ? v[0] : null;

/**
 * One photo per plan, for lists of things a customer bought — the plan's own
 * picture, else its business's gallery, else the business's logo (the order
 * the plan page and the cart use).
 *
 * Subscription rows hold whichever plan id their table knows: a universal id,
 * or a legacy one that lives on the mirror as `source_plan_id` (cleaning's is
 * not even a uuid). The map answers for both, so a caller passes what it has.
 */
export function usePlanPhotos(planIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(planIds.filter((x): x is string => !!x).map(String))).sort();
  const { data } = useQuery({
    queryKey: ["plan-photos", ids],
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const uuids = ids.filter((id) => UUID.test(id));
      const quoted = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      const filter = uuids.length
        ? `id.in.(${uuids.join(",")}),source_plan_id.in.(${quoted})`
        : `source_plan_id.in.(${quoted})`;
      const { data: rows, error } = await supabaseDb
        .from("provider_plans")
        .select("id, source_plan_id, gallery_urls, providers(gallery_urls, avatar_url)")
        .or(filter);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (rows ?? []) as any[]) {
        const photo = first(r.gallery_urls) ?? first(r.providers?.gallery_urls) ?? (r.providers?.avatar_url || null);
        if (!photo) continue;
        map.set(String(r.id), photo);
        if (r.source_plan_id) map.set(String(r.source_plan_id), photo);
      }
      return map;
    },
  });
  return (id?: string | null): string | null => (id && data?.get(String(id))) || null;
}
