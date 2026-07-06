import { Navigate, useParams } from "react-router-dom";
import { useUniversalIdForLegacy } from "@/lib/services/providerBridge";

/**
 * Redirects a legacy admin provider-detail route
 * (`/admin/<service>/providers/:id`) into the unified admin detail
 * (`/admin/marketplace/providers/:universalId`). Falls back to the marketplace
 * list when there's no universal mirror. Kept in its own lightweight module so
 * it doesn't pull the heavy legacy tab graph into the main bundle.
 */
export default function LegacyProviderRedirect({ sourceKey }: { sourceKey: string }) {
  const { id } = useParams<{ id: string }>();
  const { data: universalId, isLoading } = useUniversalIdForLegacy(sourceKey, id ?? null);
  if (id && isLoading) return null;
  return <Navigate to={universalId ? `/admin/marketplace/providers/${universalId}` : "/admin/marketplace/providers"} replace />;
}
