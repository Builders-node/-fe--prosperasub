import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getNavigationForRoles, isNavItemActive } from "@/config/navigation";

export function BottomNav() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const navItems = getNavigationForRoles(roles);

  const isPublicBottomNavRoute =
    location.pathname === "/" ||
    location.pathname === "/cleaning" ||
    location.pathname.startsWith("/cleaning/");

  if (!isAuthenticated && !isPublicBottomNavRoute) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden yd-nav yd-border border-t"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>
        {navItems.filter((item) => !(!isAuthenticated && item.requiresAuth)).map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          const iconStyle = { color: isActive ? "hsl(var(--yd-text))" : "hsl(var(--muted-foreground))" };
          const labelStyle = { fontWeight: isActive ? 700 : 500, color: isActive ? "hsl(var(--yd-text))" : "hsl(var(--muted-foreground))" };
          const className = "flex flex-1 flex-col items-center justify-center gap-1 transition-colors";
          const inner = (
            <>
              <item.icon className="h-[26px] w-[26px]" style={iconStyle} strokeWidth={isActive ? 2.2 : 1.8} />
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
