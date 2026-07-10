import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { UserModeProvider } from "@/contexts/UserModeContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { CartProvider } from "@/contexts/CartContext";
import { LanguageProvider } from "@/i18n";

import ProtectedRoute from "@/components/ProtectedRoute";
import InstallAppModal from "@/components/InstallAppModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
const History = lazy(() => import("./pages/user/History"));
const MyBusiness = lazy(() => import("./pages/user/MyBusiness"));
const BecomeProvider = lazy(() => import("./pages/BecomeProvider"));
const ProviderApplications = lazy(() => import("./pages/admin/ProviderApplications"));
const LegacyPortalRedirect = lazy(() => import("./pages/user/LegacyPortalRedirect"));

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

// Public provider profile — generic for cleaning/rental/entertainment. Food
// keeps its own /services/food/:id detail page (richer legacy layout).
const ProviderDetail = lazy(() => import("./pages/ProviderDetail"));


// Food
const FoodListing = lazy(() => import("./pages/food/FoodListing"));
const FoodProviderDetail = lazy(() => import("./pages/food/FoodProviderDetail"));
const FoodPlanDetail = lazy(() => import("./pages/food/FoodPlanDetail"));
const FoodSubscriptionDetail = lazy(() => import("./pages/food/FoodSubscriptionDetail"));

// Super Admin
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const CleaningPlans = lazy(() => import("./pages/admin/CleaningPlans"));
const ServiceArchetypes = lazy(() => import("./pages/admin/ServiceArchetypes"));
const MarketplaceProviders = lazy(() => import("./pages/admin/MarketplaceProviders"));
const MarketplaceProviderDetail = lazy(() => import("./pages/admin/MarketplaceProviderDetail"));
const LegacyProviderRedirect = lazy(() => import("./pages/admin/LegacyProviderRedirect"));
const MarketplacePlans = lazy(() => import("./pages/admin/MarketplacePlans"));
const MarketplaceSubscriptions = lazy(() => import("./pages/admin/MarketplaceSubscriptions"));
const MyProvider = lazy(() => import("./pages/user/MyProvider"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AdsManagement = lazy(() => import("./pages/admin/AdsManagement"));
const CarRentalsCustomers = lazy(() => import("./pages/admin/CarRentalsCustomers"));

// Admin Food
const FoodResidences = lazy(() => import("./pages/admin/FoodResidences"));
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

/**
 * Rewrites the leading `from` segment of the current pathname to `to`,
 * preserving the rest (including :params and query). Used to redirect legacy
 * short URLs (/food/xyz) to the canonical /services/... path in one line.
 */
function LegacyRewrite({ from, to }: { from: string; to: string }) {
  const { pathname, search, hash } = useLocation();
  const suffix = pathname.startsWith(from) ? pathname.slice(from.length) : "";
  return <Navigate to={`${to}${suffix}${search}${hash}`} replace />;
}

const App = () => {
  return (
    <ErrorBoundary>
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
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Public access verification (staff scan a user's QR) */}
              <Route path="/verify" element={<VerifyAccess />} />

              {/* Discovery */}
              <Route path="/discovery" element={<Discovery />} />

              {/* ─── Services — one unified pattern: /services/:key/… ───────
                  All public listings and their sub-flows live here. Legacy
                  short URLs below 302 to the canonical path. */}

              {/* Cleaning */}
              <Route path="/services/cleaning" element={<CleaningPackages />} />
              <Route path="/services/cleaning/checkout/:packageId" element={
                <ProtectedRoute><CleaningCheckout /></ProtectedRoute>
              } />
              <Route path="/services/cleaning/book" element={
                <ProtectedRoute><CleaningBook /></ProtectedRoute>
              } />

              {/* Food */}
              <Route path="/services/food" element={<FoodListing />} />
              <Route path="/services/food/:id" element={<FoodProviderDetail />} />
              <Route path="/services/food/:providerId/plans/:planId" element={<FoodPlanDetail />} />
              <Route path="/services/food/subscription/:id" element={
                <ProtectedRoute><FoodSubscriptionDetail /></ProtectedRoute>
              } />

              {/* Rental */}
              <Route path="/services/rental" element={<CarRental />} />
              <Route path="/services/rental/:id" element={<CarDetail />} />
              <Route path="/services/rental/:id/book" element={
                <ProtectedRoute><CarBooking /></ProtectedRoute>
              } />

              {/* Beach Club */}
              <Route path="/services/beach-club" element={<BeachClub />} />
              <Route path="/services/beach-club/courts" element={
                <ProtectedRoute><BeachCourts /></ProtectedRoute>
              } />
              <Route path="/services/beach-club/checkout/:planId" element={
                <ProtectedRoute><BeachClubCheckout /></ProtectedRoute>
              } />

              {/* Public provider profile — cleaning / rental / entertainment.
                  Food has its own /services/food/:id route above. */}
              <Route path="/services/:archetypeKey/providers/:providerId" element={<ProviderDetail />} />

              {/* ─── Legacy short-URL redirects (kept so old bookmarks / emails
                  keep working; new nav should always use /services/…). */}
              <Route path="/cleaning"                element={<Navigate to="/services/cleaning" replace />} />
              <Route path="/cleaning/checkout/:packageId" element={<LegacyRewrite from="/cleaning" to="/services/cleaning" />} />
              <Route path="/cleaning/book"           element={<Navigate to="/services/cleaning/book" replace />} />
              <Route path="/food"                    element={<Navigate to="/services/food" replace />} />
              <Route path="/food/:id"                element={<LegacyRewrite from="/food" to="/services/food" />} />
              <Route path="/food/:providerId/plans/:planId" element={<LegacyRewrite from="/food" to="/services/food" />} />
              <Route path="/food/subscription/:id"   element={<LegacyRewrite from="/food" to="/services/food" />} />
              <Route path="/cars"                    element={<Navigate to="/services/rental" replace />} />
              <Route path="/cars/:id"                element={<LegacyRewrite from="/cars" to="/services/rental" />} />
              <Route path="/cars/:id/book"           element={<LegacyRewrite from="/cars" to="/services/rental" />} />
              <Route path="/beach-club"              element={<Navigate to="/services/beach-club" replace />} />
              <Route path="/beach-club/courts"       element={<Navigate to="/services/beach-club/courts" replace />} />
              <Route path="/beach-club/checkout/:planId" element={<LegacyRewrite from="/beach-club" to="/services/beach-club" />} />

              {/* Cart */}
              <Route path="/cart" element={<Cart />} />

              {/* User */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute><MySubscriptions /></ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute><Notifications /></ProtectedRoute>
              } />
              <Route path="/history" element={
                <ProtectedRoute><History /></ProtectedRoute>
              } />
              <Route path="/my-business" element={
                <ProtectedRoute><MyBusiness /></ProtectedRoute>
              } />
              <Route path="/my-provider/:providerId" element={
                <ProtectedRoute><MyProvider /></ProtectedRoute>
              } />
              {/* Legacy portal URLs — resolve ?providerId=<legacy> to universal and redirect. */}
              <Route path="/my-restaurant"  element={<ProtectedRoute><LegacyPortalRedirect service="food" /></ProtectedRoute>} />
              <Route path="/my-car-rental"  element={<ProtectedRoute><LegacyPortalRedirect service="cars" /></ProtectedRoute>} />
              <Route path="/my-cleaning"    element={<ProtectedRoute><LegacyPortalRedirect service="cleaning" /></ProtectedRoute>} />
              <Route path="/become-a-provider" element={<BecomeProvider />} />
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
              <Route path="/admin/categories" element={<Navigate to="/admin/services" replace />} />
              <Route path="/admin/services" element={
                <ProtectedRoute allowedRoles={['super_admin']}><ServiceArchetypes /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/providers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceProviders /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/providers/applications" element={
                <ProtectedRoute allowedRoles={['super_admin']}><ProviderApplications /></ProtectedRoute>
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
              {/* Legacy redirects — old cleaning-specific admin pages now live inside the
                  Cleaning provider workspace (Marketplace → Providers → Cleaning).
                  Subscriptions go to the universal Sales view. */}
              <Route path="/admin/cleaning-plans"         element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/cleaning/operations"    element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/cleaning"               element={<Navigate to="/admin/marketplace/providers" replace />} />
              <Route path="/admin/cleaning/subscriptions" element={<Navigate to="/admin/marketplace/subscriptions" replace />} />
              <Route path="/admin/subscriptions"          element={<Navigate to="/admin/marketplace/subscriptions" replace />} />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminUsers /></ProtectedRoute>
              } />
              <Route path="/admin/clients" element={<Navigate to="/admin/users" replace />} />
              <Route path="/admin/provider-applications" element={<Navigate to="/admin/marketplace/providers/applications" replace />} />
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
              {/* /admin/settings retired — platform_fee_percent moved into Finance
                  (NetProfitPanel); min/max subscription weeks were unused. Redirect
                  any stale bookmarks straight to Finance. */}
              <Route path="/admin/settings" element={<Navigate to="/admin/payments" replace />} />
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

              <Route path="/admin/food/subscriptions" element={<Navigate to="/admin/marketplace/subscriptions" replace />} />
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
    </ErrorBoundary>
  );
};

export default App;
