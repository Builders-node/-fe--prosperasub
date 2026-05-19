import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getNavigationForRoles, isNavItemActive } from "@/config/navigation";
import { useIsMobile } from "@/hooks/use-mobile";

export function BottomNav() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const isMobile = useIsMobile();

  // Get navigation items based on user role
  let navItems = getNavigationForRoles(roles);

  // On mobile, hide "Platform" and "Restaurant" entries — accessible via Profile page
  if (isMobile) {
    navItems = navItems.filter(
      (item) => item.path !== "/admin/dashboard" && item.path !== "/restaurant"
    );
  }

  const isPublicBottomNavRoute =
    location.pathname === "/" ||
    location.pathname === "/cleaning" ||
    location.pathname === "/restaurants" ||
    location.pathname.startsWith("/restaurants/") ||
    location.pathname.startsWith("/plan/");

  // Don't render for unauthenticated users on protected pages
  // (they'll be redirected anyway)
  if (!isAuthenticated && !isPublicBottomNavRoute) {
    return null;
  }

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around py-space-1">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn("bottom-nav-item", isActive && "active")}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
