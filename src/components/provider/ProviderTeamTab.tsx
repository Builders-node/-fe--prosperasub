import { UniversalStaffTab } from "@/components/provider/UniversalStaffTab";

/**
 * The team of a provider — one tab, one table, every service.
 *
 * There used to be three of these, differing only in which manager table they
 * wrote to and which optional columns that table happened to have: food kept
 * `user_name`, cleaning kept `role`, the beach had a third table that was
 * never created. `provider_members` has all of those columns, so the
 * parameters collapse to a constant and the tab stops being per-service.
 *
 * It takes the UNIVERSAL provider id, not the legacy one:
 * `provider_members.provider_id` references `providers(id)`.
 */
export function ProviderTeamTab({
  providerId, ownerUserId,
}: {
  providerId: string;
  ownerUserId: string | null | undefined;
}) {
  return (
    <UniversalStaffTab
      providerId={providerId}
      ownerUserId={ownerUserId}
      providerTable="providers"
      managerTable="provider_members"
      entityLabel="business"
      auditEntityProvider="provider"
      auditEntityManager="provider_member"
      hasUserNameColumn
      hasRoleColumn
    />
  );
}
