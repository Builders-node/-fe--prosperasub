import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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

  // Explain the bounce so an owner tapping their card doesn't just get
  // dumped back on /my-business with no idea why.
  const willBounce = !isLoading && (!legacyId || (!universalId && legacyId));
  useEffect(() => {
    if (willBounce) toast.error("This business isn't linked to your account.");
  }, [willBounce]);

  if (!legacyId) return <Navigate to="/my-business" replace />;
  if (isLoading) return <PageLoader />;
  if (universalId) return <Navigate to={`/my-provider/${universalId}`} replace />;
  return <Navigate to="/my-business" replace />;
}
