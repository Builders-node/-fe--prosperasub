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
  const isSuperAdminArea = location.pathname.startsWith("/admin");
  const isRestaurantAdminArea = location.pathname.startsWith("/restaurant");

  if (isSuperAdminArea) {
    navItems = navItems.filter((item) => item.path.startsWith("/admin"));
  } else if (isRestaurantAdminArea) {
    navItems = navItems.filter((item) => item.path.startsWith("/restaurant"));
  }

  // On mobile, hide "Platform" and "Restaurant" entries — accessible via Profile page
  if (isMobile && !isSuperAdminArea && !isRestaurantAdminArea) {
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
  if (!isAuthenticated && !isPublicBottomNavRoute) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E8E8E8] bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>
        {navItems.map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
            >
              <item.icon
                className={cn("h-[26px] w-[26px]", isActive ? "text-[#111111]" : "text-[#BBBBBB]")}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={cn(
                  "text-[10px] leading-none",
                  isActive ? "font-bold text-[#111111]" : "font-medium text-[#BBBBBB]",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
