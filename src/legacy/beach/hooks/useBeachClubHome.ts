import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { providerHref } from "@/lib/services/serviceUrls";

/**
 * The Beach Club's page, wherever the club is filed.
 *
 * The club used to own a listing at /services/beach-club because it was the
 * whole of the Lifestyle service. It is one business inside a service now, so
 * its address is read from its row rather than written into the app — move it
 * to another service in the admin and every link follows. Falls back to the
 * home page while loading or if the club is not on the platform.
 */
export function useBeachClubHome(): string {
  const { data } = useQuery({
    queryKey: ["beach-provider-home"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, archetype_key")
        .eq("source_service_key", "beach")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as { id: string; archetype_key: string | null } | null;
      return row?.archetype_key ? providerHref(row.archetype_key, row.id) : null;
    },
  });
  return data ?? "/discovery";
}
