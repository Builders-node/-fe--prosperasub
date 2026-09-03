import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errorMessage";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { CartProvider } from "@/contexts/CartContext";
import { LanguageProvider } from "@/i18n";

import ProtectedRoute from "@/components/app/ProtectedRoute";
import { SiteAdBanner } from "@/components/patterns/AdBanner";
import InstallAppModal from "@/components/patterns/InstallAppModal";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
import { PageLoader } from "@/components/ui/spinner";

// ─── Eager (entry / public surface) ───────────────────────────────────────────
// Loaded on first paint — keep this list small.
import Discovery from "./pages/Discovery";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

// ─── Lazy (everything else) ───────────────────────────────────────────────────
// React.lazy + dynamic import() gives each page its own bundle chunk. Public
// visitors never download admin code; admins don't download Food details
// until they navigate there.

// Auth
// Car rental — a whole storefront of its own, mounted at /vehicles. One lazy
// chunk, so a visitor who never opens it never downloads it.
const VehiclesApp = lazy(() => import("@/features/vehicles/pages/VehiclesApp"));

const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Public access verification (staff scan a user's QR)
const VerifyAccess = lazy(() => import("./pages/VerifyAccess"));

// User
const MySubscriptions = lazy(() => import("./pages/user/MySubscriptions"));
const Profile = lazy(() => import("./pages/user/Profile"));
const Notifications = lazy(() => import("./pages/user/Notifications"));
const History = lazy(() => import("./pages/user/History"));
const MyBusiness = lazy(() => import("./pages/user/MyBusiness"));
const BecomeProvider = lazy(() => import("./pages/BecomeProvider"));
const ProviderApplications = lazy(() => import("./pages/admin/ProviderApplications"));
const LegacyPortalRedirect = lazy(() => import("./pages/user/LegacyPortalRedirect"));

// Beach Club
const BeachClub = lazy(() => import("./legacy/beach/pages/BeachClub"));
const BeachCourts = lazy(() => import("./legacy/beach/pages/BeachCourts"));
const BookCalendar = lazy(() => import("./pages/BookCalendar"));

// Cleaning
const CleaningPackages = lazy(() => import("./pages/cleaning/CleaningPackages"));
const CleaningBook = lazy(() => import("./pages/cleaning/CleaningBook"));


// Cart
const Cart = lazy(() => import("./pages/Cart"));
const SearchPage = lazy(() => import("./pages/Search"));

// Public provider profile — generic for cleaning/entertainment. Food
// keeps its own /services/food/:id detail page (richer legacy layout).
const ProviderDetail = lazy(() => import("./pages/ProviderDetail"));
const PlanCheckout = lazy(() => import("./pages/PlanCheckout"));
const ServicePage = lazy(() => import("./pages/ServicePage"));
const PlanDetail = lazy(() => import("./pages/PlanDetail"));


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
const CarRentals = lazy(() => import("./pages/admin/CarRentals"));
const CleaningPlans = lazy(() => import("./pages/admin/CleaningPlans"));
const ServiceCategories = lazy(() => import("./pages/admin/ServiceCategories"));
const MarketplaceProviders = lazy(() => import("./pages/admin/MarketplaceProviders"));
const MarketplaceProviderDetail = lazy(() => import("./pages/admin/MarketplaceProviderDetail"));
const LegacyProviderRedirect = lazy(() => import("./pages/admin/LegacyProviderRedirect"));
const MarketplacePlans = lazy(() => import("./pages/admin/MarketplacePlans"));
const Support = lazy(() => import("./pages/Support"));
const AdminSupport = lazy(() => import("./pages/admin/Support"));
const MarketplaceHub = lazy(() => import("./pages/admin/MarketplaceHub"));
const MarketplaceServiceDetail = lazy(() => import("./pages/admin/MarketplaceServiceDetail"));
const MarketplaceSubscriptions = lazy(() => import("./pages/admin/MarketplaceSubscriptions"));
const MyProvider = lazy(() => import("./pages/user/MyProvider"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AdsManagement = lazy(() => import("./pages/admin/AdsManagement"));

// Where the platform operates. Lived under "Admin Food" and was named for the
// food table it reads (`food_residences`), but residences gate cleaning plans,
// checkout and saved addresses too — the backend has called it /admin/locations
// all along. It was imported here and never routed, so Settings → Locations was
// a 404 for as long as the entry existed.
const Locations = lazy(() => import("./pages/admin/Locations"));
// Admin Beach Club
const BeachClubPlans = lazy(() => import("./legacy/beach/pages/BeachClubPlans"));
const BeachClubSubscriptions = lazy(() => import("./legacy/beach/pages/BeachClubSubscriptions"));
const BeachClubCourts = lazy(() => import("./legacy/beach/pages/BeachClubCourts"));

// ─── Suspense fallback ────────────────────────────────────────────────────────
// Unified loader (Spinner is a tiny leaf module — no extra chunk).
const PageFallback = () => <PageLoader className="min-h-screen bg-background" />;

/**
 * No load may fail in silence.
 *
 * Most screens read `useQuery` as `const { data: rows = [] } = …` and never
 * look at `isError`, so a request that fails renders exactly like a table with
 * nothing in it. That is not a cosmetic slip: the admin panel showed "No roles
 * found" with three roles in the database, and there was no way to tell the
 * difference from the outside. Sixty-odd call sites do this, and the next one
 * written will too.
 *
 * A component that handles its own error state is still better — it can retry
 * in place. This is the floor beneath them: whatever the screen decides to
 * render, the failure itself is always said out loud.
 *
 * Deduped by message so five queries failing together (one dead API, one
 * expired session) speak once, not five times.
 */
const recentlyReported = new Map<string, number>();
const REPORT_WINDOW_MS = 8_000;

const reportQueryFailure = (error: unknown) => {
  const message = errorMessage(error);
  if (!message) return;
  const now = Date.now();
  // Sweep first, or the map grows for the life of the tab.
  recentlyReported.forEach((at, key) => {
    if (now - at > REPORT_WINDOW_MS) recentlyReported.delete(key);
  });
  if (recentlyReported.has(message)) return;
  recentlyReported.set(message, now);
  toast.error("Couldn't load some data", { description: message });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportQueryFailure }),
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
              {/*
                `v7_startTransition` is what stops a route change from blanking
                the screen. Without it, navigating to a page whose chunk is not
                loaded yet suspends outside a transition: React throws away the
                whole tree and paints the full-screen fallback, so the header
                and the tab bar disappear and come back. Inside a transition
                React keeps the current screen on-screen until the new one is
                ready, and the shell never moves.
              */}
              <BrowserRouter future={{ v7_startTransition: true }}>
                <AuthModalProvider>
                <LocationProvider>
                <CartProvider>
                {/* Site chrome on desktop: the ad strip rides above every
                    customer-facing route instead of living on Discovery alone
                    and vanishing on the first click. See SiteAdBanner. */}
                <SiteAdBanner />
                <Suspense fallback={<PageFallback />}>
                <Routes>
              {/* Home → Discovery */}
              <Route path="/" element={<Navigate to="/discovery" replace />} />

              {/*
                The car storefront is a section, not a site: its own header,
                tab bar and routes, inside this provider tree so it shares the
                session, the cart context and the query client. The splat hands
                everything under /vehicles to its own router.
              */}
              <Route path="/vehicles/*" element={<VehiclesApp />} />

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
              <Route path="/services/cleaning/checkout/:planId" element={
                <ProtectedRoute><PlanCheckout /></ProtectedRoute>
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

              {/* Beach Club */}
              <Route path="/services/beach-club" element={<BeachClub />} />
              <Route path="/services/beach-club/courts" element={
                <ProtectedRoute><BeachCourts /></ProtectedRoute>
              } />
              <Route path="/services/beach-club/checkout/:planId" element={
                <ProtectedRoute><PlanCheckout /></ProtectedRoute>
              } />

              {/* The vehicles archetype is universal in the data model — a rental
                  business is an ordinary `providers` row — but its storefront is
                  the /vehicles section, not the generic providers-and-plans
                  list. Discovery links straight there; this catches typed and
                  older URLs. Static, so it outranks the dynamic route below. */}
              <Route path="/services/vehicles" element={<Navigate to="/vehicles" replace />} />

              {/* Generic listing for any archetype without a bespoke page.
                  The static /services/<name> routes above win over this dynamic
                  one — React Router prefers a static segment — so the rich
                  cleaning / food / beach pages are untouched. This is what lets
                  a service added in /admin/services be reachable at all. */}
              <Route path="/services/:archetypeKey" element={<ServicePage />} />

              {/* The plan's own page — what a card in a listing opens. Food's
                  longer route above is more specific and still matches first,
                  but it only forwards here (or to the checkout for a renewal),
                  so a food plan is read on this page like every other. */}
              <Route path="/services/:archetypeKey/plans/:planId" element={<PlanDetail />} />

              {/* ── The checkout ────────────────────────────────────────────
                  One screen for every service. The per-service paths below it
                  are kept because customers have them open in tabs and in
                  emails, and they all land here. */}
              <Route path="/checkout/:planId" element={
                <ProtectedRoute><PlanCheckout /></ProtectedRoute>
              } />
              <Route path="/services/:archetypeKey/checkout/plan/:planId" element={
                <ProtectedRoute><PlanCheckout /></ProtectedRoute>
              } />

              {/* Public provider profile — cleaning / entertainment. Food has
                  its own /services/food/:id route above. */}
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
              <Route path="/beach-club"              element={<Navigate to="/services/beach-club" replace />} />
              <Route path="/beach-club/courts"       element={<Navigate to="/services/beach-club/courts" replace />} />
              <Route path="/beach-club/checkout/:planId" element={<LegacyRewrite from="/beach-club" to="/services/beach-club" />} />

              {/* Cart */}
              {/* The basket and the checkout are two screens: one to review
                  what you are buying, one to pay for it. Same component, two
                  URLs, so the phone's back button walks between them. */}
              <Route path="/cart" element={<Cart />} />
              <Route path="/cart/checkout" element={<Cart />} />
              {/* "Search on Everysub" — one field over the whole catalogue.
                  Public: browsing is what a search is for. */}
              <Route path="/search" element={<SearchPage />} />

              {/* User */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute><MySubscriptions /></ProtectedRoute>
              } />
              <Route path="/account" element={
                <ProtectedRoute><Profile /></ProtectedRoute>
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
              {/* Book a time on any provider's calendar. The CALENDAR is a
                  shop window and renders signed out; only holding a slot needs
                  an account (the engine takes the subject from the token), and
                  the page asks for it at that moment. Gating the whole route
                  put the login sheet over a black void. */}
              <Route path="/providers/:providerId/book" element={<BookCalendar />} />
              {/* Legacy portal URLs — resolve ?providerId=<legacy> to universal and redirect. */}
              <Route path="/my-restaurant"  element={<ProtectedRoute><LegacyPortalRedirect service="food" /></ProtectedRoute>} />
              <Route path="/my-cleaning"    element={<ProtectedRoute><LegacyPortalRedirect service="cleaning" /></ProtectedRoute>} />
              <Route path="/become-a-provider" element={<BecomeProvider />} />
              {/* Reachable signed out on purpose — someone who can't log in
                  is exactly who needs to reach a human. */}
              <Route path="/support" element={<Support />} />
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
              {/* The flat Services + Categories CRUDs are retired: creating a
                  service lives on the Marketplace hub, editing/hiding/deleting
                  on the service's own drill-down, categories in its Categories
                  tab. Old bookmarks land on the hub. */}
              <Route path="/admin/categories" element={<Navigate to="/admin/marketplace" replace />} />
              <Route path="/admin/services" element={<Navigate to="/admin/marketplace" replace />} />
              <Route path="/admin/services/categories" element={<Navigate to="/admin/marketplace" replace />} />
              {/* Drill-down entry point: Marketplace → service → its lists. The flat
                  lists below stay routable — they're linked from the hub and are the
                  only way to reach providers whose archetype_key went null. */}
              <Route path="/admin/marketplace" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceHub /></ProtectedRoute>
              } />
              <Route path="/admin/marketplace/service/:key" element={
                <ProtectedRoute allowedRoles={['super_admin']}><MarketplaceServiceDetail /></ProtectedRoute>
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
              <Route path="/admin/support" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminSupport /></ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["users.read"]}><AdminUsers /></ProtectedRoute>
              } />
              {/* Transport is its own layer, Booking.com-style — the sidebar's
                  Transport section, mirroring the storefront's family split.
                  The Marketplace hub carries experiences only. */}
              <Route path="/admin/transport" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["subscriptions.read"]}><CarRentals /></ProtectedRoute>
              } />
              {/* The address it had before the split. */}
              <Route path="/admin/car-rentals" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["subscriptions.read"]}><CarRentals /></ProtectedRoute>
              } />
              {/* Clients are the second tab of /admin/users now — a billed
                  business is a different thing from an individual account, and
                  the tab keeps the distinction while the section has one door. */}
              <Route path="/admin/clients" element={<Navigate to="/admin/users?tab=clients" replace />} />
              <Route path="/admin/provider-applications" element={<Navigate to="/admin/marketplace/providers/applications" replace />} />
              <Route path="/admin/payments" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["payments.read"]}><AdminPayments /></ProtectedRoute>
              } />
              <Route path="/admin/profit" element={<Navigate to="/admin/payments" replace />} />
              <Route path="/admin/roles" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["role_management.read"]}><RoleManagement /></ProtectedRoute>
              } />
              <Route path="/admin/audit-logs" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["admin_settings.read"]}><AuditLogs /></ProtectedRoute>
              } />
              {/* /admin/settings retired — platform_fee_percent moved into Finance
                  (NetProfitPanel); min/max subscription weeks were unused. Redirect
                  any stale bookmarks straight to Finance. */}
              <Route path="/admin/settings" element={<Navigate to="/admin/payments" replace />} />
              <Route path="/admin/locations" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["admin_settings.read"]}><Locations /></ProtectedRoute>
              } />
              <Route path="/admin/food/residences" element={<Navigate to="/admin/locations" replace />} />
              <Route path="/admin/ads" element={
                <ProtectedRoute allowedRoles={['super_admin']} requiredPermissions={["admin_settings.read"]}><AdsManagement /></ProtectedRoute>
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
