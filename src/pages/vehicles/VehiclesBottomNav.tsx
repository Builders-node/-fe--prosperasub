import { Link, useLocation } from "react-router-dom";
import { CalendarCheck, Car, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { carPath, trimPath } from "@/pages/vehicles/routes";
import { cn } from "@/lib/utils";

/**
 * The car storefront's tab bar — the marketplace's own, in its measurements:
 * 60px of content plus the home-indicator inset, a card-coloured bar with no
 * top border (the grey page behind it is the separation), and colour as the
 * only signal of the active tab.
 *
 * Account points at the marketplace's profile, which is now an ordinary
 * in-app link: there is one origin, one session and one profile, so leaving
 * the car section for it is a route change and not a page load.
 */

interface Item {
  icon: typeof Car;
  label: string;
  to: string;
  /**
   * Sub-paths of the car section that also belong to this tab. Needed because
   * a detail page is not under its tab's own path: a booking is read at
   * /vehicles/booking/:id while the tab that owns it is /vehicles/my-bookings.
   */
  also?: string[];
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

const ITEMS: Item[] = [
  { icon: Car,           label: "Fleet",    to: carPath(),                 also: ["vehicle", "book"] },
  { icon: CalendarCheck, label: "Bookings", to: carPath("my-bookings"),    also: ["booking"], requiresAuth: true },
  { icon: ShieldCheck,   label: "Admin",    to: carPath("admin/vehicles"), adminOnly: true },
  { icon: User,          label: "Account",  to: "/account",                requiresAuth: true },
];

/**
 * The section's home is an exact match only — every other tab lives beneath
 * it, so treating it as a prefix lit Fleet up on every screen. The trailing
 * slash on `also` matters too: without it "book" swallows "booking".
 */
const isActive = (item: Item, rawPath: string): boolean => {
  const pathname = trimPath(rawPath);
  if (pathname === item.to) return true;
  if (item.to !== carPath() && pathname.startsWith(`${item.to}/`)) return true;
  return (item.also ?? []).some((seg) => pathname.startsWith(carPath(`${seg}/`)));
};

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
          const active = isActive(item, pathname);
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

          return (
            <Link key={item.label} to={item.to} className={className}>{inner}</Link>
          );
        })}
      </div>
    </nav>
  );
}
