import { UniversalStaffTab } from "@/components/provider/UniversalStaffTab";
import type { FoodProvider } from "@/types/food";

export function RestaurantStaffTab({ restaurant }: { restaurant: FoodProvider }) {
  return (
    <UniversalStaffTab
      providerId={restaurant.id}
      ownerUserId={restaurant.admin_user_id}
      providerTable="food_providers"
      managerTable="food_restaurant_managers"
      entityLabel="restaurant"
      auditEntityProvider="food_provider"
      auditEntityManager="food_restaurant_manager"
      hasUserNameColumn
      invalidateKeysOnOwnerChange={[["admin-food-restaurant", restaurant.id]]}
    />
  );
}
