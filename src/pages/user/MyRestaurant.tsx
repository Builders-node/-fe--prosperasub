import { Navigate, useSearchParams } from "react-router-dom";
import { ProviderPortalShell } from "@/components/provider/ProviderPortalShell";
import { FOOD_TABS, useUniversalIdForLegacy } from "@/components/provider/legacyPortalTabs";
import { useMyRestaurants, type MyRestaurant } from "@/hooks/useMyRestaurants";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

const SERVICE = SERVICE_REGISTRY.food as typeof SERVICE_REGISTRY.food & {
  providers: NonNullable<typeof SERVICE_REGISTRY.food["providers"]>;
};

/**
 * Legacy route. Redirects into the unified `/my-provider/:id` portal when a
 * universal mirror exists; otherwise falls back to the original shell.
 */
export default function MyRestaurantPage() {
  const [searchParams] = useSearchParams();
  const legacyId = searchParams.get("providerId");
  const { data: universalId, isLoading: resolving } = useUniversalIdForLegacy("food", legacyId);
  const { restaurants, isLoading } = useMyRestaurants();

  if (universalId) return <Navigate to={`/my-provider/${universalId}`} replace />;

  return (
    <ProviderPortalShell<MyRestaurant>
      service={SERVICE}
      providers={restaurants}
      isLoading={isLoading || (!!legacyId && resolving)}
      tabs={FOOD_TABS}
      getAvatarUrl={(r) => r.avatar_url}
      getBannerUrl={(r) => r.banner_url}
      getPublicHref={(r) => `/food/${r.id}`}
    />
  );
}
