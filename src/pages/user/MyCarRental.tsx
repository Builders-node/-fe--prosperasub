import { Navigate, useSearchParams } from "react-router-dom";
import { ProviderPortalShell } from "@/components/provider/ProviderPortalShell";
import { CAR_TABS, useUniversalIdForLegacy } from "@/components/provider/legacyPortalTabs";
import { useMyCarRentals, type MyCarRental } from "@/hooks/useMyCarRentals";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

const SERVICE = SERVICE_REGISTRY.cars as typeof SERVICE_REGISTRY.cars & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cars["providers"]>;
};

/**
 * Legacy route. Redirects into the unified `/my-provider/:id` portal when a
 * universal mirror exists; otherwise falls back to the original shell so older
 * providers without a universal row keep working.
 */
export default function MyCarRentalPage() {
  const [searchParams] = useSearchParams();
  const legacyId = searchParams.get("providerId");
  const { data: universalId, isLoading: resolving } = useUniversalIdForLegacy("cars", legacyId);
  const { providers, isLoading } = useMyCarRentals();

  if (universalId) return <Navigate to={`/my-provider/${universalId}`} replace />;

  return (
    <ProviderPortalShell<MyCarRental>
      service={SERVICE}
      providers={providers}
      isLoading={isLoading || (!!legacyId && resolving)}
      tabs={CAR_TABS}
      getAvatarUrl={(p) => p.logo_url}
      getPublicHref={() => `/cars`}
    />
  );
}
