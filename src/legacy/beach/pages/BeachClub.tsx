import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { providerHref } from "@/lib/services/serviceUrls";

/**
 * /services/beach-club — the club's old storefront, now an address only.
 *
 * The Beach Club used to be the whole of the Lifestyle service, so it had a
 * listing page of its own. It moved into an ordinary service (Clubs & Sport)
 * and is shown by the same provider page every business gets. The URL stays
 * because it is printed on the club's landing site, in the sitemap and in
 * people's bookmarks.
 *
 * Where it lands is read from the business row, not written here: whichever
 * service the admin files the club under, this follows.
 */
export default function BeachClub() {
  const { search } = useLocation();
  const { data: target, isLoading } = useQuery({
    queryKey: ["beach-provider-home"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers")
        .select("id, archetype_key")
        .eq("source_service_key", "beach")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const row = data as { id: string; archetype_key: string | null } | null;
      return row?.archetype_key ? providerHref(row.archetype_key, row.id) : "/discovery";
    },
  });

  if (isLoading) return <PageLoader />;
  return <Navigate to={`${target ?? "/discovery"}${search}`} replace />;
}
