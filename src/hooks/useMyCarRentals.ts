import { useMyProviders, type MyProviderRole } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";
import type { RentalProvider } from "@/types/carRental";

export type { MyProviderRole };

export interface MyCarRental extends RentalProvider {
  myRole: MyProviderRole;
}

const SERVICE = SERVICE_REGISTRY.cars as typeof SERVICE_REGISTRY.cars & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cars["providers"]>;
};

/**
 * Car-rental agencies the current user owns (`rental_providers.admin_user_id === me`)
 * or manages (row in `rental_provider_managers`). Thin adapter over
 * {@link useMyProviders} — same query pattern as restaurants, all details
 * come from the registry.
 */
export function useMyCarRentals() {
  const { providers, isLoading, hasAny } = useMyProviders<MyCarRental>(SERVICE);
  return { providers, isLoading, hasAny };
}
