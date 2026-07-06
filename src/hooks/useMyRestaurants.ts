import { useMyProviders, type MyProviderRole } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";
import type { FoodProvider } from "@/types/food";

export type MyRestaurantRole = MyProviderRole;

export interface MyRestaurant extends FoodProvider {
  myRole: MyRestaurantRole;
}

const SERVICE = SERVICE_REGISTRY.food as typeof SERVICE_REGISTRY.food & {
  providers: NonNullable<typeof SERVICE_REGISTRY.food["providers"]>;
};

/**
 * Restaurants the current user owns (`food_providers.admin_user_id === me`)
 * or manages (row in `food_restaurant_managers`). Thin adapter over the
 * generic {@link useMyProviders} — the query pattern, resolve-by-email, and
 * the sort live in one place.
 */
export function useMyRestaurants() {
  const { providers, isLoading, hasAny } = useMyProviders<MyRestaurant>(SERVICE);
  return { restaurants: providers, isLoading, hasAny };
}
