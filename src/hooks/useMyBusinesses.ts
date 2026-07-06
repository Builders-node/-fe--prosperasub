import { useMyProviders, type MyProviderRow } from "@/hooks/useMyProviders";
import { PROVIDER_SERVICES, type ServiceConfig, type ProviderConfig } from "@/lib/services/registry";

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

  return { groups, isLoading, hasAny: groups.length > 0 };
}
