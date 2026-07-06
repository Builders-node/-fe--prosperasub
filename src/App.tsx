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
import { LocationProvider } from "@/contexts/LocationContext";
import { CartProvider } from "@/contexts/CartContext";
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

// Public access verification (staff scan a user's QR)
const VerifyAccess = lazy(() => import("./pages/VerifyAccess"));

// User
const MySubscriptions = lazy(() => import("./pages/user/MySubscriptions"));
const Notifications = lazy(() => import("./pages/user/Notifications"));
const MyRestaurant = lazy(() => import("./pages/user/MyRestaurant"));
const MyBusiness = lazy(() => import("./pages/user/MyBusiness"));
const BecomeProvider = lazy(() => import("./pages/BecomeProvider"));
const ProviderApplications = lazy(() => import("./pages/admin/ProviderApplications"));
const MyCarRental = lazy(() => import("./pages/user/MyCarRental"));

// Beach Club
const BeachClub = lazy(() => import("./pages/beach/BeachClub"));
const BeachClubCheckout = lazy(() => import("./pages/beach/BeachClubCheckout"));
const BeachCourts = lazy(() => import("./pages/beach/BeachCourts"));

// Cleaning
const CleaningPackages = lazy(() => import("./pages/cleaning/CleaningPackages"));
const CleaningCheckout = lazy(() => import("./pages/cleaning/CleaningCheckout"));
const CleaningBook = lazy(() => import("./pages/cleaning/CleaningBook"));

// Car Rental
const CarRental = lazy(() => import("./pages/cars/CarRental"));
const CarDetail = lazy(() => import("./pages/cars/CarDetail"));
const CarBooking = lazy(() => import("./pages/cars/CarBooking"));

// Cart
const Cart = lazy(() => import("./pages/Cart"));

// Massage
const MassageListing = lazy(() => import("./pages/massage/MassageListing"));

// Food
const FoodListing = lazy(() => import("./pages/food/FoodListing"));
const FoodProviderDetail = lazy(() => import("./pages/food/FoodProviderDetail"));
const FoodPlanDetail = lazy(() => import("./pages/food/FoodPlanDetail"));
const FoodSubscriptionDetail = lazy(() => import("./pages/food/FoodSubscriptionDetail"));

// Super Admin
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const PlatformSettings = lazy(() => import("./pages/admin/PlatformSettings"));
const CleaningManagement = lazy(() => import("./pages/admin/CleaningManagement"));
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminClients = lazy(() => import("./pages/admin/Clients"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const CleaningPlans = lazy(() => import("./pages/admin/CleaningPlans"));
const MyCleaning = lazy(() => import("./pages/user/MyCleaning"));
const Categories = lazy(() => import("./pages/admin/Categories"));
const MarketplaceProviders = lazy(() => import("./pages/admin/MarketplaceProviders"));
const MarketplaceProviderDetail = lazy(() => import("./pages/admin/MarketplaceProviderDetail"));
const LegacyProviderRedirect = lazy(() => import("./pages/admin/LegacyProviderRedirect"));
const MarketplacePlans = lazy(() => import("./pages/admin/MarketplacePlans"));
const MarketplaceSubscriptions = lazy(() => import("./pages/admin/MarketplaceSubscriptions"));
const MyProvider = lazy(() => import("./pages/user/MyProvider"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const AdminSubscriptions = lazy(() => import("./pages/admin/Subscriptions"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AdsManagement = lazy(() => import("./pages/admin/AdsManagement"));
const CarRentalsCustomers = lazy(() => import("./pages/admin/CarRentalsCustomers"));

// Admin Food
const FoodResidences = lazy(() => import("./pages/admin/FoodResidences"));
const MassageProviders = lazy(() => import("./pages/admin/MassageProviders"));
const MassagePlans = lazy(() => import("./pages/admin/MassagePlans"));
const MassageSubscriptions = lazy(() => import("./pages/admin/MassageSubscriptions"));
const MassageCalendar = lazy(() => import("./pages/admin/MassageCalendar"));
const FoodSubscriptions = lazy(() => import("./pages/admin/FoodSubscriptions"));

// Admin Beach Club
const BeachClubPlans = lazy(() => import("./pages/admin/BeachClubPlans"));
const BeachClubSubscriptions = lazy(() => import("./pages/admin/BeachClubSubscriptions"));
const BeachClubCourts = lazy(() => import("./pages/admin/BeachClubCourts"));

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
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AuthModalProvider>
                <UserModeProvider>
                <LocationProvider>
                <CartProvider>
                <Suspense fallback={<PageFallback />}>
                <Routes>
              {/* Home → Discovery */}
              <Route path="/" element={<Navigate to="/discovery" replace />} />

              {/* Auth */}
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/auth" element={<OAuthCallback />} />
              <Route path="/forgot-password" element={<Navigate to="/discovery" replace />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Public access verification (staff scan a user's QR) */}
              <Route path="/verify" element={<VerifyAccess />} />

              {/* Discovery */}
              <Route path="/discovery" element={<Discovery />} />

              {/* Beach Club */}
              <Route path="/beach-club" element={<BeachClub />} />
              <Route path="/beach-club/courts" element={
                <ProtectedRoute><BeachCourts /></ProtectedRoute>
              } />
              <Route path="/beach-club/checkout/:planId" element={
                <ProtectedRoute><BeachClubCheckout /></ProtectedRoute>
              } />

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

              {/* Cart */}
              <Route path="/cart" element={<Cart />} />

              {/* Massage */}
              <Route path="/massage" element={<MassageListing />} />

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
              <Route path="/my-cleaning" element={
                <ProtectedRoute><MyCleaning /></ProtectedRoute>
              } />
              <Route path="/my-provider/:providerId" element={
                <ProtectedRoute><MyProvider /></ProtectedRoute>
              } />
              <Route path="/category/:key" element={<CategoryPage />} />
              <Route path="/become-a-provider" element={<BecomeProvider />} />
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
              <Route path="/admin/cleaning/plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningPlans /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning/providers" element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/categories" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Categories /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/providers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceProviders /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/providers/:providerId" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceProviderDetail /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplacePlans /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceSubscriptions /></ProtectedRoute>
              } />
              <Route path="/admin/analytics" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Analytics /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning/analytics" element={<Navigate to="/admin/analytics?service=cleaning" replace />} />
              <Route path="/admin/cleaning/operations" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningManagement /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminSubscriptions /></ProtectedRoute>
              } />
              {/* Legacy redirects */}
              <Route path="/admin/cleaning-plans" element={<Navigate to="/admin/cleaning/plans" replace />} />
              <Route path="/admin/cleaning" element={<Navigate to="/admin/cleaning/operations" replace />} />
              <Route path="/admin/subscriptions" element={<Navigate to="/admin/cleaning/subscriptions" replace />} />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminUsers /></ProtectedRoute>
              } />
              <Route path="/admin/clients" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminClients /></ProtectedRoute>
              } />
              <Route path="/admin/provider-applications" element={
                <ProtectedRoute allowedRoles={['super_admin']}><ProviderApplications /></ProtectedRoute>
              } />
              <Route path="/admin/payments" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminPayments /></ProtectedRoute>
              } />
              <Route path="/admin/profit" element={<Navigate to="/admin/payments" replace />} />
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
              {/* Admin Car Rentals — vehicles & reservations are managed per provider (Food-style) */}
              <Route path="/admin/car-rentals" element={<Navigate to="/admin/car-rentals/providers" replace />} />
              <Route path="/admin/car-rentals/reservations" element={<Navigate to="/admin/car-rentals/providers" replace />} />
              <Route path="/admin/car-rentals/customers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsCustomers /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/analytics" element={<Navigate to="/admin/analytics?service=cars" replace />} />
              <Route path="/admin/car-rentals/delivery" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/insurance" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/extras" element={
                <Navigate to="/admin/car-rentals/providers" replace />
              } />
              <Route path="/admin/car-rentals/providers" element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/car-rentals/providers/:id" element={
                <ProtectedRoute allowedRoles={['super_admin']}><LegacyProviderRedirect sourceKey="cars" /></ProtectedRoute>
              } />
              {/* Admin Food */}
              <Route path="/admin/food/analytics" element={<Navigate to="/admin/analytics?service=food" replace />} />
              <Route path="/admin/food/providers" element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/food/providers/:id" element={
                <ProtectedRoute allowedRoles={['super_admin']}><LegacyProviderRedirect sourceKey="food" /></ProtectedRoute>
              } />
              <Route path="/admin/food/residences" element={<Navigate to="/admin/locations" replace />} />
              <Route path="/admin/locations" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodResidences /></ProtectedRoute>
              } />

              {/* Admin Massage */}
              <Route path="/admin/massage/providers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MassageProviders /></ProtectedRoute>
              } />
              <Route path="/admin/massage/plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MassagePlans /></ProtectedRoute>
              } />
              <Route path="/admin/massage/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MassageSubscriptions /></ProtectedRoute>
              } />
              <Route path="/admin/massage/calendar" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MassageCalendar /></ProtectedRoute>
              } />
              <Route path="/admin/food/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><FoodSubscriptions /></ProtectedRoute>
              } />
              {/* Admin Beach Club */}
              <Route path="/admin/beach-club/analytics" element={<Navigate to="/admin/analytics?service=beach" replace />} />
              <Route path="/admin/beach-club/plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><BeachClubPlans /></ProtectedRoute>
              } />
              <Route path="/admin/beach-club/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><BeachClubSubscriptions /></ProtectedRoute>
              } />
              <Route path="/admin/beach-club/courts" element={
                <ProtectedRoute allowedRoles={['super_admin']}><BeachClubCourts /></ProtectedRoute>
              } />
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                <InstallAppModal />
                </CartProvider>
                </LocationProvider>
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
