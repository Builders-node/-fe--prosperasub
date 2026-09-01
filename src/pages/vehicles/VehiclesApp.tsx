import { type ReactNode, useEffect } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { Moon, Sun, User, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { AppContainer } from "@/components/layout/AppContainer";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import OAuthCallback from "@/pages/OAuthCallback";
import Fleet from "@/pages/vehicles/Fleet";
import VehicleDetail from "@/pages/vehicles/VehicleDetail";
import Book from "@/pages/vehicles/Book";
import MyBookings from "@/pages/vehicles/MyBookings";
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

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  );
}

function VehiclesLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin, userData, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { pathname } = useLocation();

  const navItem = (to: string, label: string) => (
    <Link
      to={to}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
        pathname === to ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Same chrome as everysub.net: a plain card-coloured header with the
          19px black wordmark — the grey page below is the separation. */}
      <header className="sticky top-0 z-40 bg-card">
        <AppContainer className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="text-[19px] font-black tracking-tight text-foreground transition-colors hover:text-primary">
            EverySub <span className="text-primary">Cars</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItem("/", "Fleet")}
            {isAuthenticated && navItem("/my-bookings", "My bookings")}
            {isSuperAdmin && navItem("/admin/vehicles", "Admin")}
          </nav>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[140px] truncate text-sm font-semibold text-foreground sm:block">
                  {userData?.name || userData?.email}
                </span>
                <button
                  type="button"
                  aria-label="Log out"
                  onClick={() => logout()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4.5 w-4.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90"
              >
                <User className="h-4 w-4" /> Log in
              </button>
            )}
          </div>
        </AppContainer>
      </header>

      {/* Mobile nav */}
      <AppContainer className="flex items-center gap-1 py-2 md:hidden">
        {navItem("/", "Fleet")}
        {isAuthenticated && navItem("/my-bookings", "My bookings")}
        {isSuperAdmin && (
          <Link to="/admin/vehicles" className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Admin
          </Link>
        )}
      </AppContainer>

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
        <Route path="/admin" element={<Navigate to="/admin/vehicles" replace />} />
        <Route path="/admin/vehicles" element={<RequireAdmin><AdminTabs><AdminVehicles /></AdminTabs></RequireAdmin>} />
        <Route path="/admin/bookings" element={<RequireAdmin><AdminTabs><AdminBookings /></AdminTabs></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </VehiclesLayout>
  );
}
