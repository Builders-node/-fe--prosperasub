import { UniversalStaffTab } from "@/components/provider/UniversalStaffTab";
import type { CleaningProviderRow } from "./CleaningInfoTab";

export function CleaningStaffTab({ provider }: { provider: CleaningProviderRow }) {
  const adminUserId = (provider as any).admin_user_id as string | null | undefined;
  return (
    <UniversalStaffTab
      providerId={provider.id}
      ownerUserId={adminUserId}
      providerTable="cleaning_providers"
      managerTable="cleaning_provider_managers"
      entityLabel="cleaning provider"
      auditEntityProvider="cleaning_provider"
      auditEntityManager="cleaning_provider_manager"
      hasRoleColumn
      invalidateKeysOnOwnerChange={[["admin-legacy-provider-row"]]}
    />
  );
}
