import { useQuery } from "@tanstack/react-query";
import { useMyProviders, type MyProviderRow } from "@/hooks/useMyProviders";
import { PROVIDER_SERVICES, type ServiceConfig, type ProviderConfig } from "@/lib/services/registry";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";

export interface BusinessGroup {
  service: ServiceConfig & { providers: ProviderConfig };
  rows: MyProviderRow[];
}

/**
 * All businesses the current user owns or manages, grouped by service.
 *
 * Registry-driven: adding a new marketplace category (with a providerConfig)
 * automatically shows up here — no code change needed in MyBusiness or in
 * the "AccountMenu → My Business" dropdown gating.
 */
export function useMyBusinesses() {
  const groups: BusinessGroup[] = [];
  let isLoading = false;

  for (const service of PROVIDER_SERVICES) {
    // Rules-of-hooks compliant: PROVIDER_SERVICES is a compile-time constant
    // from the registry, so hook order is stable across renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const q = useMyProviders(service);
    if (q.isLoading) isLoading = true;
    if (q.hasAny) groups.push({ service, rows: q.providers });
  }

  /**
   * Businesses that live only in the universal `providers` table.
   *
   * PROVIDER_SERVICES is the registry's three legacy services — cars, food,
   * cleaning — so a beach club owner, or the owner of a universal-only
   * provider like Massage, came back as owning nothing. That is the difference
   * between the home screen offering them "My business" and pitching them to
   * become a provider they already are.
   */
  const { userData } = useAuth();
  const userUuid = useUserUuid();
  const ownerId = userUuid ?? userData?.id ?? null;
  const legacyKeys = PROVIDER_SERVICES.map((s) => s.key);

  const universal = useQuery({
    queryKey: ["my-universal-providers", ownerId],
    enabled: !!ownerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, source_service_key, status")
        .eq("admin_user_id", ownerId!)
        .eq("status", "active");
      if (error) throw error;
      // Anything the registry already covers is counted above — this only adds
      // what nothing else would find.
      return (data ?? []).filter((p: any) => !legacyKeys.includes(p.source_service_key));
    },
  });

  return {
    groups,
    isLoading: isLoading || universal.isLoading,
    hasAny: groups.length > 0 || (universal.data?.length ?? 0) > 0,
  };
}
