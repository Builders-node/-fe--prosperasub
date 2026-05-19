import { Routes, Route, Navigate } from "react-router-dom";
import { RestaurantProvider } from "@/contexts/RestaurantContext";

// Restaurant pages
import RestaurantList from "@/pages/restaurant/RestaurantList";
import RestaurantDashboardPage from "@/pages/restaurant/DashboardPage";
import MenuManagementPage from "@/pages/restaurant/MenuManagementPage";
import PlansManagementPage from "@/pages/restaurant/PlansManagementPage";
import SubscribersPage from "@/pages/restaurant/SubscribersPage";
import TodaysMealsPage from "@/pages/restaurant/TodaysMealsPage";

/**
 * Restaurant Admin Routes
 * 
 * URL Structure:
 * - /restaurant                    → Restaurant list (selection page)
 * - /restaurant/:restaurantId/dashboard   → Dashboard for specific restaurant
 * - /restaurant/:restaurantId/menu        → Menu management
 * - /restaurant/:restaurantId/plans       → Subscription plans
 * - /restaurant/:restaurantId/subscribers → Subscriber management
 * - /restaurant/:restaurantId/meals       → Today's meals
 * - /restaurant/:restaurantId/wallet      → Wallet/payment settings
 */
const RestaurantAdminRoutes = () => {
  return (
    <RestaurantProvider>
      <Routes>
        {/* Restaurant List / Selection */}
        <Route index element={<RestaurantList />} />
        
        {/* Restaurant-scoped routes */}
        <Route path=":restaurantId/dashboard" element={<RestaurantDashboardPage />} />
        <Route path=":restaurantId/menu" element={<MenuManagementPage />} />
        <Route path=":restaurantId/plans" element={<PlansManagementPage />} />
        <Route path=":restaurantId/subscribers" element={<SubscribersPage />} />
        <Route path=":restaurantId/meals" element={<TodaysMealsPage />} />
        
        {/* Legacy routes - redirect to new structure */}
        <Route path="dashboard" element={<Navigate to="/restaurant" replace />} />
        <Route path="menu" element={<Navigate to="/restaurant" replace />} />
        <Route path="plans" element={<Navigate to="/restaurant" replace />} />
        <Route path="subscribers" element={<Navigate to="/restaurant" replace />} />
        <Route path="meals" element={<Navigate to="/restaurant" replace />} />
        
        {/* Default redirect for restaurant ID without page */}
        <Route path=":restaurantId" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </RestaurantProvider>
  );
};

export default RestaurantAdminRoutes;
