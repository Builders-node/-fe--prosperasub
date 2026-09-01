import { type ReactNode, useEffect } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { VehiclesHeader } from "@/pages/vehicles/VehiclesHeader";
import { AppContainer } from "@/components/layout/AppContainer";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import OAuthCallback from "@/pages/OAuthCallback";
import Fleet from "@/pages/vehicles/Fleet";
import VehicleDetail from "@/pages/vehicles/VehicleDetail";
import Book from "@/pages/vehicles/Book";
import MyBookings from "@/pages/vehicles/MyBookings";
import BookingDetail from "@/pages/vehicles/BookingDetail";
import AdminVehicles from "@/pages/vehicles/admin/AdminVehicles";
import AdminBookings from "@/pages/vehicles/admin/AdminBookings";

/**
 * The car-rental storefront served on vehicles.everysub.net.
 *
 * It is a whole app of its own — its own header, its own routes — but it runs
 * inside the main frontend's provider tree, so it shares the session, the
 * theme and the query client with everysub.net rather than reimplementing
 * them. `App.tsx` mounts this instead of the marketplace when the hostname is
 * the vehicles one; see `isVehiclesHost`.
 */

function VehiclesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <VehiclesHeader />
      <main>{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    return (
      <AppContainer className="py-24 text-center">
        <p className="font-semibold text-foreground">Please sign in to continue.</p>
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="mt-4 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
        >
          Log in
        </button>
      </AppContainer>
    );
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isSuperAdmin, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated || !isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminTabs({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const tab = (to: string, label: string) => (
    <Link to={to} className={cn(
      "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
      pathname === to ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
    )}>{label}</Link>
  );
  return (
    <div>
      <AppContainer className="flex gap-2 pt-5">
        {tab("/admin/vehicles", "Fleet")}
        {tab("/admin/bookings", "Bookings")}
      </AppContainer>
      {children}
    </div>
  );
}

export default function VehiclesApp() {
  // The document title ships in index.html for the marketplace; this origin is
  // a different storefront and has to say so (tab, bookmark, share sheet).
  useEffect(() => {
    document.title = "EverySub Cars — rent a car in Pr\u00f3spera";
  }, []);

  return (
    <VehiclesLayout>
      <Routes>
        <Route path="/" element={<Fleet />} />
        {/* Google sends the browser back to /auth on THIS origin, so the
            callback has to exist here too or the sign-in dead-ends. */}
        <Route path="/auth" element={<OAuthCallback />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/vehicle/:id" element={<VehicleDetail />} />
        <Route path="/book/:id" element={<RequireAuth><Book /></RequireAuth>} />
        <Route path="/my-bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
        <Route path="/booking/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
        <Route path="/admin" element={<Navigate to="/admin/vehicles" replace />} />
        <Route path="/admin/vehicles" element={<RequireAdmin><AdminTabs><AdminVehicles /></AdminTabs></RequireAdmin>} />
        <Route path="/admin/bookings" element={<RequireAdmin><AdminTabs><AdminBookings /></AdminTabs></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </VehiclesLayout>
  );
}
