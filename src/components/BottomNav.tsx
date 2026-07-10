import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getNavigationForRoles, isNavItemActive } from "@/config/navigation";
import { useUnreadCount } from "@/hooks/useNotifications";

export function BottomNav() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { data: unreadCount = 0 } = useUnreadCount();

  const navItems = getNavigationForRoles(roles);
  const visibleNavItems = navItems.filter((item) => !(!isAuthenticated && item.requiresAuth));

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden yd-nav yd-border border-t"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>
        {visibleNavItems.map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          const iconStyle = { color: isActive ? "hsl(var(--yd-text))" : "hsl(var(--muted-foreground))" };
          const labelStyle = { fontWeight: isActive ? 700 : 500, color: isActive ? "hsl(var(--yd-text))" : "hsl(var(--muted-foreground))" };
          const className = "flex flex-1 flex-col items-center justify-center gap-1 transition-colors";
          const isNotifications = item.path === "/notifications";
          const inner = (
            <>
              <span className="relative">
                <item.icon className="h-[26px] w-[26px]" style={iconStyle} strokeWidth={isActive ? 2.2 : 1.8} />
                {isNotifications && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] leading-none" style={labelStyle}>{item.label}</span>
            </>
          );

          if (item.requiresAuth && !isAuthenticated) {
            return (
              <button
                key={item.path}
                type="button"
                className={className}
                onClick={() => openAuthModal("login", item.path)}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={item.path} to={item.path} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
