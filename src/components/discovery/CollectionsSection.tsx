import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { PlanRail, ShelfHeader, planIndex, useHomePlans } from "@/components/discovery/homePlans";

/**
 * The shelves an admin puts together for the home page — "Popular", "For
 * beginners", "For families" (Admin → Marketing → Collections).
 *
 * Read straight from the tables (public RLS on active shelves). A plan that
 * has since gone inactive or private simply drops off its shelf, because the
 * shelf is resolved against the same live list "All plans" shows; a shelf
 * left with nothing on it is not drawn. Without the table (migration not yet
 * applied) the query errors and the section is just absent.
 */

interface Shelf { id: string; title: string; subtitle: string | null; planIds: string[] }

function useHomeCollections() {
  return useQuery({
    queryKey: ["home-collections"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Shelf[]> => {
      const { data, error } = await supabaseDb
        .from("home_collections")
        .select("id, title, subtitle, sort_order, home_collection_plans(plan_id, sort_order)")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string; title: string; subtitle: string | null;
        home_collection_plans: Array<{ plan_id: string; sort_order: number }> | null;
      }>).map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        planIds: [...(r.home_collection_plans ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => String(p.plan_id)),
      }));
    },
  });
}

export function CollectionsSection() {
  const { data: shelves = [] } = useHomeCollections();
  const { data: plans = [], isLoading } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);

  if (shelves.length === 0) return null;

  return (
    <>
      {shelves.map((s) => {
        const items = s.planIds.map((id) => index.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
        if (!isLoading && items.length === 0) return null;
        return (
          <section key={s.id} className="space-y-3" aria-label={s.title}>
            <ShelfHeader title={s.title} subtitle={s.subtitle} />
            <PlanRail plans={items} loading={isLoading} />
          </section>
        );
      })}
    </>
  );
}
