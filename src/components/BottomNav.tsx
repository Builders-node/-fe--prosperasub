import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getNavigationForRoles, isNavItemActive } from "@/config/navigation";
import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { prefetchRoute, prefetchShellRoutes } from "@/lib/routeChunks";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { count: cartCount } = useCart();

  const navItems = getNavigationForRoles(roles);
  const visibleNavItems = navItems.filter((item) => !(!isAuthenticated && item.requiresAuth));

  // The tab bar is on screen the whole session and its four destinations are
  // where most taps go, so their chunks are fetched once the app goes quiet.
  useEffect(() => {
    prefetchShellRoutes(visibleNavItems.map((i) => i.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNavItems.length]);

  // Public browsing surfaces where bottom nav must stay reachable — otherwise
  // an unauthenticated user who taps a service tile gets stranded with no way
  // back to Discovery / My Subscriptions without the browser back button.
  const isPublicBottomNavRoute =
    location.pathname === "/" ||
    location.pathname === "/discovery" ||
    location.pathname.startsWith("/services/") ||
    location.pathname === "/cart";

  if (!isAuthenticated && !isPublicBottomNavRoute) {
    return null;
  }

  if (visibleNavItems.length <= 1) {
    return null;
  }

  return (
    // White bar, 60px of content plus the home-indicator inset — the design's
    // 84px total on an iPhone 14. No top border: the page behind it is #f6f6f6
    // and the white is the separation.
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>
        {visibleNavItems.map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          // Active is the brand orange, everything else the secondary grey —
          // no weight change, no stroke change: the colour is the state.
          const tone = isActive ? "text-primary" : "text-muted-foreground";
          const className = "flex flex-1 flex-col items-center justify-center gap-1 p-2 transition-colors";
          // A finger resting on the glass is ~100ms of free time before the
          // click fires — enough for most chunks to arrive.
          const warm = () => prefetchRoute(item.path);
          const isCart = item.path === "/cart";
          const inner = (
            <>
              <span className={cn("relative flex h-6 w-6 items-center justify-center", tone)}>
                <item.icon className="h-full w-full" />
                {isCart && cartCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-none text-primary-foreground">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </span>
              <span className={cn("text-[12px] leading-4", tone)}>{item.label}</span>
            </>
          );

          if (item.requiresAuth && !isAuthenticated) {
            return (
              <button
                key={item.path}
                type="button"
                className={className}
                onClick={() => openAuthModal("login", item.path)}
                onPointerDown={warm}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={item.path} to={item.path} className={className} onPointerDown={warm} onMouseEnter={warm}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
