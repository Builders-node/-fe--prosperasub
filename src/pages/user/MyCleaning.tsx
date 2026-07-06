import { Navigate, useSearchParams } from "react-router-dom";
import { ProviderPortalShell } from "@/components/provider/ProviderPortalShell";
import { CLEANING_TABS, useUniversalIdForLegacy } from "@/components/provider/legacyPortalTabs";
import { type CleaningProviderRow } from "@/components/cleaning/CleaningInfoTab";
import { useMyProviders } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

const SERVICE = SERVICE_REGISTRY.cleaning as typeof SERVICE_REGISTRY.cleaning & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cleaning["providers"]>;
};

/**
 * Legacy route. Redirects into the unified `/my-provider/:id` portal when a
 * universal mirror exists; otherwise falls back to the original shell.
 */
export default function MyCleaningPage() {
  const [searchParams] = useSearchParams();
  const legacyId = searchParams.get("providerId");
  const { data: universalId, isLoading: resolving } = useUniversalIdForLegacy("cleaning", legacyId);
  const { providers, isLoading } = useMyProviders<CleaningProviderRow>(SERVICE);

  if (universalId) return <Navigate to={`/my-provider/${universalId}`} replace />;

  return (
    <ProviderPortalShell<CleaningProviderRow>
      service={SERVICE}
      providers={providers}
      isLoading={isLoading || (!!legacyId && resolving)}
      tabs={CLEANING_TABS}
      getAvatarUrl={(p) => p.avatar_url}
      getBannerUrl={(p) => p.banner_url}
      getPublicHref={() => `/cleaning`}
    />
  );
}
