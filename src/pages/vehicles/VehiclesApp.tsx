import { type ReactNode, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { VEHICLES_BASE, carPath } from "@/pages/vehicles/routes";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { useGoBack } from "@/hooks/useGoBack";
import { BottomNav } from "@/components/BottomNav";
import { AppContainer } from "@/components/layout/AppContainer";
import { PageLoader } from "@/components/ui/spinner";
import Fleet from "@/pages/vehicles/Fleet";
import VehicleDetail from "@/pages/vehicles/VehicleDetail";
import Book from "@/pages/vehicles/Book";
import MyBookings from "@/pages/vehicles/MyBookings";
import BookingDetail from "@/pages/vehicles/BookingDetail";

/**
 * The car-rental storefront, mounted at /vehicles.
 *
 * It owns its own routes and its own pages, and nothing else. The header and
 * the tab bar are the app's — the ones every other section uses. It had a
 * matching pair of its own while it lived on a second origin, where there was
 * no app around it to borrow them from; keeping them here would have meant two
 * headers and two tab bars in one app, which is one of each too many.
 *
 * Its routes are relative because `App.tsx` mounts it under a splat; its links
 * are absolute and go through `carPath` (see routes.ts).
 */

/** What the tab says while the marketplace is not the thing on screen. */
const CARS_TITLE = "EverySub Cars — rent a car in Próspera";

function VehiclesLayout({ children }: { children: ReactNode }) {
  return (
    /*
      No header here.
      
      The shell used to draw one for every car page, which meant the fleet
      could not use `ListingHeader` — the component every other service listing
      is topped with — without ending up with two title bars. The result was a
      header that looked like the others rather than being them.
      
      Marketplace pages each bring their own: a listing takes ListingHeader, a
      detail page takes HomeHeader. Car pages do the same now, so "the same
      header" is the same component and not a copy of its measurements.
      
      pb-24 leaves room for the fixed tab bar, which would otherwise sit on top
      of the last thing on the page.
    */
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}

/**
 * An ordinary sub-page of the car section: the app's title bar above it.
 *
 * The listing brings `ListingHeader` and the car page brings `DetailHeader`,
 * because those are what the equivalent marketplace pages bring. Everything
 * else here is a plain sub-page, and a plain sub-page gets the plain header —
 * the same two components, wrapped once at the route rather than pasted into
 * three files with three sets of early returns.
 */
function CarPage({ title, children }: { title: string; children: ReactNode }) {
  const goBack = useGoBack(carPath());
  return (
    <>
      <DesktopHeader />
      <HomeHeader title={title} showBackButton onBack={goBack} />
      {children}
    </>
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

export default function VehiclesApp() {
  /**
   * The tab title belongs to whatever is on screen. index.html ships the
   * marketplace's, so this section sets its own on the way in and puts it back
   * on the way out — without the restore, leaving for /discovery left the tab
   * still saying "Cars".
   */
  useEffect(() => {
    const previous = document.title;
    document.title = CARS_TITLE;
    return () => { document.title = previous; };
  }, []);

  return (
    <VehiclesLayout>
      <Routes>
        <Route index element={<Fleet />} />
        <Route path="vehicle/:id" element={<VehicleDetail />} />
        <Route path="book/:id" element={<RequireAuth><CarPage title="Book"><Book /></CarPage></RequireAuth>} />
        <Route path="my-bookings" element={<RequireAuth><CarPage title="My bookings"><MyBookings /></CarPage></RequireAuth>} />
        <Route path="booking/:id" element={<RequireAuth><CarPage title="Booking"><BookingDetail /></CarPage></RequireAuth>} />
        {/*
          The fleet had a second admin of its own here, because on a separate
          origin /admin was out of reach. It is one app now, so cars are run
          from the one admin panel — with its sidebar, its permissions and its
          audit log — and these paths only carry old bookmarks there.
        */}
        <Route path="admin/*" element={<Navigate to="/admin/car-rentals" replace />} />
        <Route path="*" element={<Navigate to={VEHICLES_BASE} replace />} />
      </Routes>
    </VehiclesLayout>
  );
}
