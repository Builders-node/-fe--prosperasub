import { Navigate, useSearchParams } from "react-router-dom";
import { PageLoader } from "@/components/ui/spinner";
import { useUniversalIdForLegacy, type LegacySourceKey } from "@/lib/services/providerBridge";

/**
 * Legacy per-service portal routes (`/my-restaurant`, `/my-car-rental`,
 * `/my-cleaning`) accepted a `?providerId=<legacyId>` query and rendered a
 * legacy `ProviderPortalShell`. Every provider now has a universal mirror in
 * the `providers` table, so we just resolve legacy → universal id and jump
 * into the canonical `/my-provider/:universalId` portal.
 *
 * Kept as a URL alias for the sake of old bookmarks, deep links in emails and
 * `service.providers.portalRoute()` callers in the registry. All rich per-
 * service tabs still render inside `/my-provider/:id` via `LegacyOwnerPortal`.
 */
export default function LegacyPortalRedirect({ service }: { service: LegacySourceKey }) {
  const [searchParams] = useSearchParams();
  const legacyId = searchParams.get("providerId");
  const { data: universalId, isLoading } = useUniversalIdForLegacy(service, legacyId);

  if (!legacyId) return <Navigate to="/my-business" replace />;
  if (isLoading) return <PageLoader />;
  if (universalId) return <Navigate to={`/my-provider/${universalId}`} replace />;
  return <Navigate to="/my-business" replace />;
}
