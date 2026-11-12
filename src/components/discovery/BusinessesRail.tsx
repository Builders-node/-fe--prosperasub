import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { Skeleton } from "@/components/patterns/Skeleton";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { providerHref } from "@/lib/services/serviceUrls";
import { ShelfHeader, useHomePlans } from "@/components/discovery/homePlans";

/**
 * "Businesses" — every live business on the island, by its logo.
 *
 * People look for a PLACE as often as for a service ("where is Elias"), and
 * until now no business was named on the home page except inside a plan card.
 * Only businesses with something on sale are shown: a business page with no
 * offers is a dead end, and this rail is a way in.
 */

interface Business { id: string; name: string; archetype_key: string; avatar_url: string | null }

function useHomeBusinesses() {
  return useQuery({
    queryKey: ["home-businesses"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Business[]> => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, archetype_key, avatar_url")
        .eq("status", "active")
        .not("archetype_key", "is", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Business[];
    },
  });
}

export function BusinessesRail() {
  const { data: businesses = [], isLoading } = useHomeBusinesses();
  const { data: plans = [], isLoading: plansLoading } = useHomePlans();
  const { archetypes } = useServiceArchetypes(true);

  const selling = useMemo(() => {
    const ids = new Set(plans.map((p) => p.provider?.id));
    const live = new Set(archetypes.map((a) => a.key));
    return businesses.filter((b) => ids.has(b.id) && live.has(b.archetype_key));
  }, [businesses, plans, archetypes]);
  const labelOf = (key: string) => archetypes.find((a) => a.key === key)?.label ?? "";

  const loading = isLoading || plansLoading;
  if (!loading && selling.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Businesses">
      <ShelfHeader title="Businesses" />
      <div className="-mx-space-4 flex gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {loading
          ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[132px] w-[112px] shrink-0 md:w-auto" />)
          : selling.map((b) => (
            <Link
              key={b.id}
              to={providerHref(b.archetype_key, b.id)}
              className="flex w-[112px] shrink-0 flex-col items-center gap-2 rounded-radius-md bg-card px-2 py-4 text-center shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40 md:w-auto"
            >
              <span aria-hidden className="h-14 w-14 shrink-0 overflow-hidden rounded-full">
                <Photo src={b.avatar_url} label={initialsOf(b.name)} />
              </span>
              <span className="w-full min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-[18px] text-foreground">{b.name}</span>
                <span className="block truncate text-meta text-muted-foreground">{labelOf(b.archetype_key)}</span>
              </span>
            </Link>
          ))}
      </div>
    </section>
  );
}
