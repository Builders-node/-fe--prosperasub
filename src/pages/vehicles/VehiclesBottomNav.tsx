import { Link, useLocation } from "react-router-dom";
import { CalendarCheck, Car, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { cn } from "@/lib/utils";

/**
 * The car storefront's tab bar — the marketplace's own, in its measurements:
 * 60px of content plus the home-indicator inset, a card-coloured bar with no
 * top border (the grey page behind it is the separation), and colour as the
 * only signal of the active tab.
 *
 * Account is deliberately a link OUT to everysub.net: the profile lives on the
 * marketplace and there is no copy of it here. The session is shared across
 * both origins, so it opens already signed in.
 */

const MARKETPLACE_ACCOUNT = "https://everysub.net/account";

interface Item {
  icon: typeof Car;
  label: string;
  /** In-app route, or an absolute URL to leave for the marketplace. */
  to: string;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

const ITEMS: Item[] = [
  { icon: Car,           label: "Fleet",    to: "/" },
  { icon: CalendarCheck, label: "Bookings", to: "/my-bookings", requiresAuth: true },
  { icon: ShieldCheck,   label: "Admin",    to: "/admin/vehicles", adminOnly: true },
  { icon: User,          label: "Account",  to: MARKETPLACE_ACCOUNT, requiresAuth: true },
];

/** `/` must not light up for every route beneath it. */
const isActive = (to: string, pathname: string) =>
  to === "/" ? pathname === "/" || pathname.startsWith("/vehicle") || pathname.startsWith("/book")
             : pathname.startsWith(to);

export function VehiclesBottomNav() {
  const { pathname } = useLocation();
  const { isAuthenticated, isSuperAdmin } = useAuth();
  const { openAuthModal } = useAuthModal();

  const items = ITEMS.filter((i) => {
    if (i.adminOnly) return isSuperAdmin;
    // Account stays in the bar signed out — it is the door people look for.
    // Bookings does not: a list you cannot have is a promise, not a door.
    if (i.requiresAuth && !isAuthenticated) return i.label === "Account";
    return true;
  });

  if (items.length <= 1) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch" style={{ height: 60 }}>
        {items.map((item) => {
          const active = isActive(item.to, pathname);
          const tone = active ? "text-primary" : "text-muted-foreground";
          const className = "flex flex-1 flex-col items-center justify-center gap-1 p-2 transition-colors";
          const inner = (
            <>
              <span className={cn("flex h-6 w-6 items-center justify-center", tone)}>
                <item.icon className="h-full w-full" />
              </span>
              <span className={cn("text-[12px] leading-4", tone)}>{item.label}</span>
            </>
          );

          if (item.requiresAuth && !isAuthenticated) {
            return (
              <button key={item.label} type="button" className={className} onClick={() => openAuthModal("login")}>
                {inner}
              </button>
            );
          }

          if (item.to.startsWith("http")) {
            return (
              <a key={item.label} href={item.to} className={className}>{inner}</a>
            );
          }

          return (
            <Link key={item.label} to={item.to} className={className}>{inner}</Link>
          );
        })}
      </div>
    </nav>
  );
}
