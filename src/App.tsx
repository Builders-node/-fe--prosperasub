import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { UserModeProvider } from "@/contexts/UserModeContext";
import { LanguageProvider } from "@/i18n";

import ProtectedRoute from "@/components/ProtectedRoute";
import InstallAppModal from "@/components/InstallAppModal";
import { PageLoader } from "@/components/ui/spinner";

// ─── Eager (entry / public surface) ───────────────────────────────────────────
// Loaded on first paint — keep this list small.
import Discovery from "./pages/Discovery";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

// ─── Lazy (everything else) ───────────────────────────────────────────────────
// React.lazy + dynamic import() gives each page its own bundle chunk. Public
// visitors never download admin code; admins don't download Cars/Food details
// until they navigate there.

// Auth
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// User
const MySubscriptions = lazy(() => import("./pages/user/MySubscriptions"));
const Notifications = lazy(() => import("./pages/user/Notifications"));
const MyRestaurant = lazy(() => import("./pages/user/MyRestaurant"));
const MyBusiness = lazy(() => import("./pages/user/MyBusiness"));
const MyCarRental = lazy(() => import("./pages/user/MyCarRental"));

// Cleaning
const CleaningPackages = lazy(() => import("./pages/cleaning/CleaningPackages"));
const CleaningCheckout = lazy(() => import("./pages/cleaning/CleaningCheckout"));
const CleaningBook = lazy(() => import("./pages/cleaning/CleaningBook"));

// Car Rental
const CarRental = lazy(() => import("./pages/cars/CarRental"));
const CarDetail = lazy(() => import("./pages/cars/CarDetail"));
const CarBooking = lazy(() => import("./pages/cars/CarBooking"));

// Food
const FoodListing = lazy(() => import("./pages/food/FoodListing"));
const FoodProviderDetail = lazy(() => import("./pages/food/FoodProviderDetail"));
const FoodPlanDetail = lazy(() => import("./pages/food/FoodPlanDetail"));
const FoodSubscriptionDetail = lazy(() => import("./pages/food/FoodSubscriptionDetail"));

// Super Admin
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const PlatformSettings = lazy(() => import("./pages/admin/PlatformSettings"));
const CleaningManagement = lazy(() => import("./pages/admin/CleaningManagement"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminClients = lazy(() => import("./pages/admin/Clients"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const CleaningPlans = lazy(() => import("./pages/admin/CleaningPlans"));
const AdminSubscriptions = lazy(() => import("./pages/admin/Subscriptions"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AdsManagement = lazy(() => import("./pages/admin/AdsManagement"));
const CarRentalsVehicles = lazy(() => import("./pages/admin/CarRentalsVehicles"));
const CarRentalsReservations = lazy(() => import("./pages/admin/CarRentalsReservations"));
const CarRentalsCustomers = lazy(() => import("./pages/admin/CarRentalsCustomers"));
const CarRentalsAnalytics = lazy(() => import("./pages/admin/CarRentalsAnalytics"));
const CarRentalsProviders = lazy(() => import("./pages/admin/CarRentalsProviders"));
const CarRentalProviderDetail = lazy(() => import("./pages/admin/CarRentalProviderDetail"));

// Admin Food
const FoodAnalytics = lazy(() => import("./pages/admin/FoodAnalytics"));
const FoodProviders = lazy(() => import("./pages/admin/FoodProviders"));
const FoodRestaurantDetail = lazy(() => import("./pages/admin/FoodRestaurantDetail"));
const FoodSubscriptions = lazy(() => import("./pages/admin/FoodSubscriptions"));

// ─── Suspense fallback ────────────────────────────────────────────────────────
// Unified loader (Spinner is a tiny leaf module — no extra chunk).
const PageFallback = () => <PageLoader className="min-h-screen bg-background" />;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 5 minutes — most page navigations re-use data
      staleTime: 1000 * 60 * 5,
      // Avoid refetch on tab focus by default; pages that need it can opt in
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AuthModalProvider>
                <UserModeProvider>
                <Suspense fallback={<PageFallback />}>
                <Routes>
              {/* Home → Discovery */}
              <Route path="/" element={<Navigate to="/discovery" replace />} />

              {/* Auth */}
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/auth" element={<OAuthCallback />} />
              <Route path="/forgot-password" element={<Navigate to="/discovery" replace />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Discovery */}
              <Route path="/discovery" element={<Discovery />} />

              {/* Cleaning */}
              <Route path="/cleaning" element={<CleaningPackages />} />
              <Route path="/cleaning/checkout/:packageId" element={
                <ProtectedRoute><CleaningCheckout /></ProtectedRoute>
              } />
              <Route path="/cleaning/book" element={
                <ProtectedRoute><CleaningBook /></ProtectedRoute>
              } />

              {/* Car Rental */}
              <Route path="/cars" element={<CarRental />} />
              <Route path="/cars/:id" element={<CarDetail />} />
              <Route path="/cars/:id/book" element={
                <ProtectedRoute><CarBooking /></ProtectedRoute>
              } />

              {/* Food */}
              <Route path="/food" element={<FoodListing />} />
              <Route path="/food/:id" element={<FoodProviderDetail />} />
              <Route path="/food/:providerId/plans/:planId" element={<FoodPlanDetail />} />
              <Route path="/food/subscription/:id" element={
                <ProtectedRoute><FoodSubscriptionDetail /></ProtectedRoute>
              } />

              {/* User */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute><MySubscriptions /></ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute><Notifications /></ProtectedRoute>
              } />
              <Route path="/my-restaurant" element={
                <ProtectedRoute><MyRestaurant /></ProtectedRoute>
              } />
              <Route path="/my-business" element={
                <ProtectedRoute><MyBusiness /></ProtectedRoute>
              } />
              <Route path="/my-car-rental" element={
                <ProtectedRoute><MyCarRental /></ProtectedRoute>
              } />
              <Route path="/account" element={<Navigate to="/my-subscriptions" replace />} />
              <Route path="/profile" element={<Navigate to="/discovery" replace />} />
              <Route path="/cleaning/my-bookings" element={<Navigate to="/my-subscriptions" replace />} />

              {/* Super Admin */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Navigate to="/admin/dashboard" replace /></ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Navigate to="/admin/dashboard" replace /></ProtectedRoute>
              } />
              <Route path="/admin/dashboard" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminDashboard /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning-plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningPlans /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningManagement /></ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminUsers /></ProtectedRoute>
              } />
              <Route path="/admin/clients" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminClients /></ProtectedRoute>
              } />
              <Route path="/admin/payments" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminPayments /></ProtectedRoute>
              } />
              <Route path="/admin/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminSubscriptions /></ProtectedRoute>
              } />
              <Route path="/admin/roles" element={
                <ProtectedRoute allowedRoles={['super_admin']}><RoleManagement /></ProtectedRoute>
              } />
              <Route path="/admin/audit-logs" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AuditLogs /></ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute allowedRoles={['super_admin']}><PlatformSettings /></ProtectedRoute>
              } />
              <Route path="/admin/ads" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdsManagement /></ProtectedRoute>
              } />
              {/* Admin Car Rentals */}
              <Route path="/admin/car-rentals" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsVehicles /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/reservations" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsReservations /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/customers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsCustomers /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/analytics" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsAnalytics /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/delivery" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/insurance" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/extras" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/providers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsProviders /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/providers/:id" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalProviderDetail /></ProtectedRoute>
              } />
              {/* Admin Food */}
              <Route path="/admin/food/analytics" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodAnalytics /></ProtectedRoute>
              } />
              <Route path="/admin/food/providers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodProviders /></ProtectedRoute>
              } />
              <Route path="/admin/food/providers/:id" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodRestaurantDetail /></ProtectedRoute>
              } />
              <Route path="/admin/food/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodSubscriptions /></ProtectedRoute>
              } />
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                <InstallAppModal />
                </UserModeProvider>
                </AuthModalProvider>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
