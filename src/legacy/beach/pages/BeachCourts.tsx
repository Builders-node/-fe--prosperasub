import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * The beach's own court screen, retired.
 *
 * It was 350 lines that read `beach_club_courts`, gated on
 * `beach_club_subscriptions`, and then called exactly the same three engine
 * endpoints the general screen calls. Everything it did is now what
 * /providers/:id/book does for any business with a calendar — including the
 * gate, which the server answers from whatever plan the customer holds rather
 * than from a beach-shaped query in the page.
 *
 * The route stays, because it is bookmarked and linked from the club's page.
 */
export default function BeachCourts() {
  const { data: providerId, isLoading } = useQuery({
    queryKey: ["beach-provider-id"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers").select("id").eq("source_service_key", "beach").limit(1).maybeSingle();
      return (data?.id ?? "") as string;
    },
  });

  useEffect(() => { /* nothing to do — the redirect below carries the visitor */ }, []);

  if (isLoading) return <PageLoader />;
  if (!providerId) return <Navigate to="/services/beach-club" replace />;
  return <Navigate to={`/providers/${providerId}/book`} replace />;
}
