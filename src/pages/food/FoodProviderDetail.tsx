import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/spinner";

/**
 * The restaurant page is the shared provider page now.
 *
 * It had its own for the weekly menu, which no longer exists, and a gallery
 * carousel, which every provider has since the profile moved to `providers`.
 * What was left was a second implementation of the same screen for one
 * service, and a customer whose journey changed depending on what they had
 * tapped.
 *
 * This stays as a forward, because the id-space differs: the old URL carries
 * `food_providers.id` and the shared page speaks `providers.id`. Redirecting
 * the raw id would land on "not found" — the split CLAUDE.md calls the number
 * one source of bugs here.
 */
const FoodProviderDetail = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["food-provider-universal-id", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers")
        .select("id")
        .eq("source_service_key", "food")
        .eq("source_provider_id", id!)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

  if (isLoading) return <PageLoader />;
  return <Navigate to={data ? `/services/food/providers/${data}` : "/services/food"} replace />;
};

export default FoodProviderDetail;
