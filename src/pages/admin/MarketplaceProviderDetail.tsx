import { useParams } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { ProviderWorkspace } from "@/components/provider/ProviderWorkspace";

/**
 * Unified admin provider detail. Same view as the owner portal
 * (`ProviderWorkspace`) but inside the admin shell, so a super_admin manages any
 * provider — rich per-service tabs for legacy-backed providers, capability tabs
 * otherwise — from one place. Replaces the per-service admin detail pages.
 */
export default function MarketplaceProviderDetail() {
  const { providerId } = useParams<{ providerId: string }>();
  return (
    <SuperAdminLayout title="Marketplace — Provider">
      <ProviderWorkspace providerId={providerId ?? ""} backHref="/admin/marketplace/providers" />
    </SuperAdminLayout>
  );
}
