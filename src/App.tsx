import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n";
import ProtectedRoute from "@/components/ProtectedRoute";

// Public pages
import Index from "./pages/Index";
import Restaurants from "./pages/Restaurants";
import RestaurantDetail from "./pages/RestaurantDetail";
import PlanDetail from "./pages/PlanDetail";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";

// User pages
import MySubscriptions from "./pages/user/MySubscriptions";
import Favorites from "./pages/user/Favorites";
import SubscriptionDetail from "./pages/user/SubscriptionDetail";
import Checkout from "./pages/user/Checkout";

// Cleaning pages
import CleaningPackages from "./pages/cleaning/CleaningPackages";
import CleaningCheckout from "./pages/cleaning/CleaningCheckout";
import CleaningBook from "./pages/cleaning/CleaningBook";

// Restaurant Admin pages - wrapped with RestaurantProvider
import RestaurantAdminRoutes from "./routes/RestaurantAdminRoutes";

// Super Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import ManageRestaurants from "./pages/admin/ManageRestaurants";
import PlatformSettings from "./pages/admin/PlatformSettings";
import CleaningManagement from "./pages/admin/CleaningManagement";
import AdminPayments from "./pages/admin/Payments";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/restaurants" element={<Restaurants />} />
              <Route path="/restaurants/:id" element={<RestaurantDetail />} />
              <Route path="/plan/:planId" element={<PlanDetail />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* User Routes */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute>
                  <MySubscriptions />
                </ProtectedRoute>
              } />
              <Route path="/favorites" element={
                <ProtectedRoute>
                  <Favorites />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Navigate to="/" replace />
                </ProtectedRoute>
              } />
              <Route path="/subscription/:id" element={
                <ProtectedRoute>
                  <SubscriptionDetail />
                </ProtectedRoute>
              } />
              <Route path="/checkout/subscription/:planId" element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              } />

              {/* Cleaning Routes */}
              <Route path="/cleaning" element={<CleaningPackages />} />
              <Route path="/cleaning/checkout/:packageId" element={
                <ProtectedRoute>
                  <CleaningCheckout />
                </ProtectedRoute>
              } />
              <Route path="/cleaning/book" element={
                <ProtectedRoute>
                  <CleaningBook />
                </ProtectedRoute>
              } />
              <Route path="/cleaning/my-bookings" element={
                <ProtectedRoute>
                  <Navigate to="/my-subscriptions?tab=cleaning" replace />
                </ProtectedRoute>
              } />

              {/* Restaurant Admin Routes - URL-driven with RestaurantContext */}
              <Route path="/restaurant/*" element={
                <ProtectedRoute requiredRoles={['restaurant_admin', 'super_admin']}>
                  <RestaurantAdminRoutes />
                </ProtectedRoute>
              } />

              {/* Super Admin Routes */}
              <Route path="/admin/dashboard" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="/admin/subscriptions" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <AdminSubscriptions />
                </ProtectedRoute>
              } />
              <Route path="/admin/payments" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <AdminPayments />
                </ProtectedRoute>
              } />
              <Route path="/admin/restaurants" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <ManageRestaurants />
                </ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <PlatformSettings />
                </ProtectedRoute>
              } />
              <Route path="/admin/cleaning" element={
                <ProtectedRoute requiredRoles={['super_admin']}>
                  <CleaningManagement />
                </ProtectedRoute>
              } />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
