import { UniversalStaffTab } from "@/components/provider/UniversalStaffTab";
import type { RentalProvider } from "@/types/carRental";

export function ProviderStaffTab({ provider }: { provider: RentalProvider }) {
  return (
    <UniversalStaffTab
      providerId={provider.id}
      ownerUserId={(provider as any).admin_user_id}
      providerTable="rental_providers"
      managerTable="rental_provider_managers"
      entityLabel="car rental"
      auditEntityProvider="rental_provider"
      auditEntityManager="rental_provider_manager"
      hasUserNameColumn
      invalidateKeysOnOwnerChange={[["admin-legacy-provider-row"]]}
    />
  );
}
